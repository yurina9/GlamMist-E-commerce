import { useContext, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ShopContext } from "../context/ShopContext";

const KhaltiCallback = () => {
  const { backendUrl, token, setCartItem } = useContext(ShopContext);
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState({
    state: "checking",
    message: "Checking your Khalti payment…",
  });
  const started = useRef(false);
  const pidx = searchParams.get("pidx");
  const purchaseOrderId = searchParams.get("purchase_order_id");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const verifyPayment = async () => {
      if (!token) {
        setResult({ state: "error", message: "Please sign in again to verify this payment." });
        return;
      }
      if (!pidx || !purchaseOrderId) {
        setResult({ state: "error", message: "Khalti did not return the required payment details." });
        return;
      }

      try {
        const response = await axios.post(
          `${backendUrl}/api/order/khalti/verify`,
          { pidx, purchaseOrderId },
          { headers: { token } },
        );
        if (response.data.success) {
          setCartItem({});
          setResult({ state: "success", message: "Your payment was verified and your order is placed." });
        } else if (["User canceled", "Expired", "Canceled", "Failed"].includes(response.data.status)) {
          setResult({ state: "cancelled", message: "Khalti did not complete this payment. You can try placing the order again." });
        } else {
          setResult({
            state: "error",
            message: response.data.message || "Payment is not confirmed yet. Please check your orders before retrying.",
          });
        }
      } catch (error) {
        setResult({
          state: "error",
          message: error.response?.data?.message || "Payment could not be verified. If you were charged, please contact support.",
        });
      }
    };

    verifyPayment();
  }, [backendUrl, pidx, purchaseOrderId, setCartItem, token]);

  const isPositive = result.state === "success";
  return (
    <main className="mx-auto my-16 max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div
        className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold ${
          isPositive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
        aria-hidden="true"
      >
        {result.state === "checking" ? "…" : isPositive ? "✓" : "!"}
      </div>
      <h1 className="mb-3 text-2xl font-semibold text-gray-900">
        {result.state === "checking"
          ? "Verifying payment"
          : isPositive
            ? "Payment successful"
            : result.state === "cancelled"
              ? "Payment not completed"
              : "Payment not verified"}
      </h1>
      <p className="text-gray-600" role="status">{result.message}</p>
      {result.state !== "checking" && (
        <div className="mt-7 flex justify-center gap-3">
          <Link className="rounded-lg border border-gray-300 px-5 py-2 text-sm" to="/">
            Continue shopping
          </Link>
          {isPositive && (
            <Link className="rounded-lg bg-black px-5 py-2 text-sm text-white" to="/orders">
              View orders
            </Link>
          )}
        </div>
      )}
    </main>
  );
};

export default KhaltiCallback;