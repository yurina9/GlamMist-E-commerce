import { createHmac, timingSafeEqual } from "node:crypto";
import orderModel from "../models/orderModel.js";
import productModel from "../models/productModel.js";
import userModel from "../models/userModel.js";
import { getEsewaConfig } from "../config/esewa.js";
import { getKhaltiConfig } from "../config/khalti.js";

const DELIVERY_FEE = 100;

const createSignature = (message, secretKey) =>
  createHmac("sha256", secretKey).update(message).digest("base64");

const verifyEsewaSignature = (data, secretKey) => {
  if (typeof data.signed_field_names !== "string" || !data.signature) {
    return false;
  }

  const fieldNames = data.signed_field_names.split(",");
  if (fieldNames.some((field) => !field || data[field] === undefined)) {
    return false;
  }

  const message = fieldNames
    .map((field) => `${field}=${data[field]}`)
    .join(",");
  const expected = Buffer.from(createSignature(message, secretKey));
  const received = Buffer.from(data.signature);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
};

const amountInPaisa = (value) => {
  const amount = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};

// placing order using COD method
export const placeOrder = async (req, res) => {
  try {
    const { userId, items, amount, address } = req.body;
    console.log("Received Order Data:", { userId, items, amount, address });

    if (!items || items.length === 0) {
      return res.json({ success: false, message: "No items in the order" });
    }

    const orderData = {
      userId,
      items, 
      amount,
      address,
      paymentMethod: "COD",
      payment: false,
      status: "pending",
      date: Date.now(),
    };

    const newOrder = await orderModel.create(orderData);
    console.log("Order created:", newOrder);

    await userModel.findByIdAndUpdate(userId, { cartData: {} });

    res.json({ success: true, message: "Order placed", order: newOrder });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Create a pending order, then initialize the Khalti KPG-2 checkout.
export const placeOrderKhalti = async (req, res) => {
  let order;
  try {
    const { userId, address } = req.body;
    const { secretKey, apiBaseUrl, frontendUrl } = getKhaltiConfig();
    if (!secretKey) {
      return res.status(500).json({
        success: false,
        message: "Khalti sandbox is not configured. Set KHALTI_SECRET_KEY in the backend environment.",
      });
    }
    if (!address || typeof address !== "object") {
      return res.status(400).json({ success: false, message: "Address is required." });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const cartEntries = Object.entries(user.cartData || {}).filter(
      ([, quantity]) => Number.isInteger(Number(quantity)) && Number(quantity) > 0,
    );
    if (cartEntries.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty." });
    }

    const quantities = new Map(
      cartEntries.map(([productId, quantity]) => [productId, Number(quantity)]),
    );
    const products = await productModel.find({
      _id: { $in: cartEntries.map(([productId]) => productId) },
    });
    if (products.length !== cartEntries.length) {
      return res.status(400).json({
        success: false,
        message: "One or more cart products are no longer available.",
      });
    }

    const items = products.map((product) => ({
      ...product.toObject(),
      quantity: quantities.get(product._id.toString()),
    }));
    const subtotal = Math.round(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
    ) / 100;
    const total = Math.round((subtotal + DELIVERY_FEE) * 100) / 100;
    const amount = Math.round(total * 100);
    if (!Number.isFinite(amount) || amount < 1000) {
      return res.status(400).json({
        success: false,
        message: "Khalti requires a minimum payment of Rs. 10.",
      });
    }

    order = await orderModel.create({
      userId,
      items,
      amount: total,
      address,
      paymentMethod: "Khalti",
      payment: false,
      status: "Payment Pending",
      date: Date.now(),
    });

    const customerName = [address.firstName, address.lastName]
      .filter(Boolean)
      .join(" ");
    const initiateResponse = await fetch(`${apiBaseUrl}/epayment/initiate/`, {
      method: "POST",
      headers: {
        Authorization: `Key ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        return_url: new URL("/payment/khalti/callback", frontendUrl).toString(),
        website_url: frontendUrl,
        amount,
        purchase_order_id: order._id.toString(),
        purchase_order_name: `GlamMist order ${order._id}`,
        customer_info: {
          name: customerName,
          email: address.email,
          phone: address.phone,
        },
        product_details: items.map((item) => ({
          identity: item._id.toString(),
          name: item.name,
          quantity: item.quantity,
          unit_price: Math.round(item.price * 100),
          total_price: Math.round(item.price * item.quantity * 100),
        })).concat({
          identity: "delivery-fee",
          name: "Delivery fee",
          quantity: 1,
          unit_price: DELIVERY_FEE * 100,
          total_price: DELIVERY_FEE * 100,
        }),
      }),
      signal: AbortSignal.timeout(15000),
    });

    const payment = await initiateResponse.json();
    if (!initiateResponse.ok || !payment.pidx || !payment.payment_url) {
      order.status = "Payment Initialization Failed";
      await order.save();
      console.error("Khalti initialization rejected the request:", payment);
      return res.status(502).json({
        success: false,
        message: "Khalti could not initialize the payment. Please try again.",
      });
    }

    order.paymentReference = payment.pidx;
    await order.save();
    return res.json({ success: true, paymentUrl: payment.payment_url });
  } catch (error) {
    if (order && order.status === "Payment Pending") {
      order.status = "Payment Initialization Failed";
      await order.save().catch((saveError) =>
        console.error("Could not update failed Khalti order:", saveError),
      );
    }
    console.error("Khalti checkout initialization failed:", error);
    return res.status(502).json({
      success: false,
      message: "Could not initialize Khalti payment. Please try again.",
    });
  }
};

// Always use Khalti's lookup API; callback query parameters alone are not proof of payment.
export const verifyKhaltiPayment = async (req, res) => {
  try {
    const { userId, pidx, purchaseOrderId } = req.body;
    const { secretKey, apiBaseUrl } = getKhaltiConfig();
    if (!secretKey) {
      return res.status(500).json({ success: false, message: "Khalti is not configured." });
    }
    if (
      typeof pidx !== "string" ||
      pidx.length > 100 ||
      typeof purchaseOrderId !== "string" ||
      purchaseOrderId.length > 100
    ) {
      return res.status(400).json({ success: false, message: "Invalid Khalti callback." });
    }

    const order = await orderModel.findOne({
      _id: purchaseOrderId,
      userId,
      paymentMethod: "Khalti",
      paymentReference: pidx,
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "Khalti order not found." });
    }
    if (order.payment) {
      return res.json({ success: true, message: "Payment already verified." });
    }

    const lookupResponse = await fetch(`${apiBaseUrl}/epayment/lookup/`, {
      method: "POST",
      headers: {
        Authorization: `Key ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pidx }),
      signal: AbortSignal.timeout(15000),
    });
    const paymentInfo = await lookupResponse.json();
    const knownUnpaidStatuses = ["Pending", "Initiated", "Expired", "User canceled", "Canceled"];
    if (!lookupResponse.ok && !knownUnpaidStatuses.includes(paymentInfo.status)) {
      console.error("Khalti lookup request failed:", paymentInfo);
      return res.status(502).json({ success: false, message: "Could not verify with Khalti." });
    }

    if (paymentInfo.status !== "Completed") {
      if (["Expired", "User canceled", "Canceled"].includes(paymentInfo.status)) {
        order.status = paymentInfo.status === "Expired" ? "Payment Expired" : "Payment Cancelled";
        await order.save();
      }
      return res.json({
        success: false,
        status: paymentInfo.status,
        message: "Khalti has not confirmed this payment.",
      });
    }
    if (
      paymentInfo.pidx !== pidx ||
      Number(paymentInfo.total_amount) !== Math.round(order.amount * 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Khalti payment details do not match this order.",
      });
    }

    const paidOrder = await orderModel.findOneAndUpdate(
      { _id: order._id, userId, payment: false },
      { $set: { payment: true, status: "Order Placed" } },
      { new: true },
    );
    if (!paidOrder) {
      const currentOrder = await orderModel.findOne({ _id: order._id, userId });
      if (!currentOrder?.payment) {
        return res.status(409).json({ success: false, message: "Could not update payment status." });
      }
    }

    await userModel.findByIdAndUpdate(userId, { cartData: {} });
    return res.json({ success: true, message: "Khalti payment verified." });
  } catch (error) {
    console.error("Khalti payment verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not verify Khalti payment. If you were charged, please contact support.",
    });
  }
};

// Create a pending order and return the signed eSewa sandbox checkout fields.
export const placeOrderEsewa = async (req, res) => {
  try {
    const { userId, address } = req.body;
    const { productCode, secretKey, formUrl, frontendUrl } = getEsewaConfig();

    if (!productCode || !secretKey) {
      return res.status(500).json({
        success: false,
        message: "eSewa payment is not configured for production.",
      });
    }
    if (!address || typeof address !== "object") {
      return res.status(400).json({ success: false, message: "Address is required." });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const cartEntries = Object.entries(user.cartData || {}).filter(
      ([, quantity]) => Number.isInteger(Number(quantity)) && Number(quantity) > 0,
    );
    if (cartEntries.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty." });
    }

    const quantities = new Map(
      cartEntries.map(([productId, quantity]) => [productId, Number(quantity)]),
    );
    const products = await productModel.find({
      _id: { $in: cartEntries.map(([productId]) => productId) },
    });
    if (products.length !== cartEntries.length) {
      return res.status(400).json({
        success: false,
        message: "One or more cart products are no longer available.",
      });
    }

    const items = products.map((product) => ({
      ...product.toObject(),
      quantity: quantities.get(product._id.toString()),
    }));
    const subtotal = Math.round(
      items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
    ) / 100;
    const total = Math.round((subtotal + DELIVERY_FEE) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ success: false, message: "Invalid order total." });
    }

    const order = await orderModel.create({
      userId,
      items,
      amount: total,
      address,
      paymentMethod: "eSewa",
      payment: false,
      status: "Payment Pending",
      date: Date.now(),
    });
    const transactionUuid = order._id.toString();
    const fields = {
      amount: subtotal.toFixed(2),
      tax_amount: "0",
      total_amount: total.toFixed(2),
      transaction_uuid: transactionUuid,
      product_code: productCode,
      product_service_charge: "0",
      product_delivery_charge: DELIVERY_FEE.toFixed(2),
    };
    fields.signed_field_names = "total_amount,transaction_uuid,product_code";
    fields.signature = createSignature(
      `total_amount=${fields.total_amount},transaction_uuid=${transactionUuid},product_code=${productCode}`,
      secretKey,
    );

    const successUrl = new URL("/payment/esewa/callback", frontendUrl).toString();
    const failureUrl = new URL("/payment/esewa/callback", frontendUrl);
    failureUrl.searchParams.set("cancelled", "1");
    failureUrl.searchParams.set("transaction_uuid", transactionUuid);
    fields.success_url = successUrl;
    fields.failure_url = failureUrl.toString();

    return res.json({
      success: true,
      paymentUrl: formUrl,
      paymentData: fields,
    });
  } catch (error) {
    console.error("eSewa checkout initialization failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not initialize eSewa payment.",
    });
  }
};

// Verify the signed browser response and confirm the transaction with eSewa.
export const verifyEsewaPayment = async (req, res) => {
  try {
    const { userId, data: encodedData } = req.body;
    const { productCode, secretKey, statusUrl } = getEsewaConfig();
    if (typeof encodedData !== "string" || encodedData.length > 10000) {
      return res.status(400).json({ success: false, message: "Invalid eSewa response." });
    }

    let paymentData;
    try {
      paymentData = JSON.parse(Buffer.from(encodedData, "base64").toString("utf8"));
    } catch {
      return res.status(400).json({ success: false, message: "Invalid eSewa response." });
    }

    if (
      !verifyEsewaSignature(paymentData, secretKey) ||
      paymentData.status !== "COMPLETE" ||
      paymentData.product_code !== productCode
    ) {
      return res.status(400).json({
        success: false,
        message: "eSewa did not confirm a valid completed payment.",
      });
    }

    const order = await orderModel.findOne({
      _id: paymentData.transaction_uuid,
      userId,
      paymentMethod: "eSewa",
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    if (amountInPaisa(paymentData.total_amount) !== amountInPaisa(order.amount)) {
      return res.status(400).json({ success: false, message: "Payment amount mismatch." });
    }
    if (order.payment) {
      return res.json({ success: true, message: "Payment already verified." });
    }

    const statusRequestUrl = new URL(statusUrl);
    statusRequestUrl.searchParams.set("product_code", productCode);
    statusRequestUrl.searchParams.set("total_amount", order.amount.toFixed(2));
    statusRequestUrl.searchParams.set("transaction_uuid", order._id.toString());

    const statusResponse = await fetch(statusRequestUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!statusResponse.ok) {
      throw new Error(`eSewa status check returned ${statusResponse.status}`);
    }
    const transactionStatus = await statusResponse.json();
    if (
      transactionStatus.status !== "COMPLETE" ||
      transactionStatus.product_code !== productCode ||
      transactionStatus.transaction_uuid !== order._id.toString() ||
      amountInPaisa(transactionStatus.total_amount) !== amountInPaisa(order.amount)
    ) {
      return res.status(400).json({
        success: false,
        message: "eSewa transaction verification failed.",
      });
    }

    const paidOrder = await orderModel.findOneAndUpdate(
      { _id: order._id, userId, payment: false },
      { $set: { payment: true, status: "Order Placed" } },
      { new: true },
    );
    if (!paidOrder) {
      const currentOrder = await orderModel.findOne({ _id: order._id, userId });
      if (!currentOrder?.payment) {
        return res.status(409).json({ success: false, message: "Could not update payment status." });
      }
    }

    await userModel.findByIdAndUpdate(userId, { cartData: {} });
    return res.json({ success: true, message: "Payment verified." });
  } catch (error) {
    console.error("eSewa payment verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Could not verify eSewa payment. Please contact support if you were charged.",
    });
  }
};

export const cancelEsewaPayment = async (req, res) => {
  try {
    const { userId, transactionUuid } = req.body;
    const order = await orderModel.findOneAndUpdate(
      {
        _id: transactionUuid,
        userId,
        paymentMethod: "eSewa",
        payment: false,
      },
      { $set: { status: "Payment Cancelled" } },
      { new: true },
    );
    return res.json({ success: true, cancelled: Boolean(order) });
  } catch (error) {
    console.error("eSewa cancellation update failed:", error);
    return res.status(500).json({ success: false, message: "Could not update order status." });
  }
};

// all order data for admin panel
export const allOrder = async (req, res) => {
  try {
    const orders = await orderModel.find({});
    res.json({ success: true, orders });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// user order data for frontend
export const userOrders = async (req, res) => {
  try {
    const { userId } = req.body;
    console.log("Fetching orders for userId:", userId);

    const orders = await orderModel.find({ userId }).sort({ date: -1 });
    console.log("Orders found:", orders);

    if (orders.length === 0) {
      return res.json({
        success: true,
        message: "No orders found",
        orders: [],
      });
    }

    res.json({ success: true, orders });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// update order status from admin panel
export const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    await orderModel.findByIdAndUpdate(orderId, { status });

    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
