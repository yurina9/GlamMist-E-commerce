import React, { useContext, useEffect, useState } from "react";
import { ShopContext } from "../context/ShopContext";
import { assets } from "../assets/assets";
import Title from "../components/Title";
import ProductItems from "../components/ProductItems";
import SearchBar from "../components/SearchBar";

const Collection = () => {
  const { products, search, showSearch } = useContext(ShopContext);
  const [showFilter, setShowFilter] = useState(false);
  const [filterProducts, setFilterProducts] = useState([]);
  const [category, setCategory] = useState([]);
  const [subcategory, setSubCategory] = useState([]);
  const [sortType, setSortType] = useState("relavent");

  const toggleCategory = (e) => {
    if (category.includes(e.target.value)) {
      setCategory((prev) => prev.filter((item) => item !== e.target.value));
    } else {
      setCategory((prev) => [...prev, e.target.value]);
    }
  };

  const toggeleSubCategory = (e) => {
    if (subcategory.includes(e.target.value)) {
      setSubCategory((prev) => prev.filter((item) => item !== e.target.value));
    } else {
      setSubCategory((prev) => [...prev, e.target.value]);
    }
  };

  const applyFilter = () => {
    let productsCopy = products.slice();

    // 🔍 Search filter
    if (showSearch && search) {
      productsCopy = productsCopy.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 🏷️ Category filter (case-insensitive)
    if (category.length > 0) {
      productsCopy = productsCopy.filter((item) =>
        category.some(
          (cat) => cat.toLowerCase() === item.category?.toLowerCase()
        )
      );
    }

    // 🔖 Subcategory filter (case-insensitive)
    if (subcategory.length > 0) {
      productsCopy = productsCopy.filter((item) =>
        subcategory.some(
          (sub) => sub.toLowerCase() === item.subCategory?.toLowerCase()
        )
      );
    }

    setFilterProducts(productsCopy);
  };

  const sortProduct = (sortType) => {
    let fpCopy = filterProducts.slice();
    switch (sortType) {
      case "low-high":
        setFilterProducts(fpCopy.sort((a, b) => a.price - b.price));
        break;

      case "high-low":
        setFilterProducts(fpCopy.sort((a, b) => b.price - a.price));
        break;

      default:
        applyFilter();
        return;
    }
  };

  useEffect(() => {
    applyFilter();
  }, [category, subcategory, search, showSearch, products]);

  useEffect(() => {
    sortProduct(sortType);
  }, [sortType]);

  return (
    <>
      <SearchBar />
      <div className="flex flex-col sm:flex-row gap-1 sm:gap-10 pt-10 border-t">
        {/* filter options */}
        <div className="min-w-60">
          <p
            onClick={() => setShowFilter(!showFilter)}
            className="my-2 text-xl flex items-center cursor-pointer gap-2"
          >
            FILTERS
            <img
              src={assets.dropdown_icon}
              alt=""
              className={`h-3 sm:hidden ${showFilter ? "rotate-90" : ""}`}
            />
          </p>

          {/* category filter */}
          <div
            className={`border border-gray-300 pl-5 py-3 mt-6 ${
              showFilter ? "" : "hidden"
            } sm:block`}
          >
            <p className="mb-3 text-sm font-medium">CATEGORIES</p>
            <div className="flex flex-col gap-2 text-sm font-light text-gray-700">
              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="uvdoux" onChange={toggleCategory} />
                UV Doux
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="technic" onChange={toggleCategory} />
                Technic
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="mamaearth" onChange={toggleCategory} />
                Mamaearth
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="cetaphil" onChange={toggleCategory} />
                Cetaphil
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="dermaco" onChange={toggleCategory} />
                Derma Co.
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="lagirl" onChange={toggleCategory} />
                L.A. Girl
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="lotus" onChange={toggleCategory} />
                Lotus
              </p>
            </div>
          </div>

          {/* subcategory filter */}
          <div
            className={`border border-gray-300 pl-5 py-3 my-5 ${
              showFilter ? "" : "hidden"
            } sm:block`}
          >
            <p className="mb-3 text-sm font-medium">Brands</p>
            <div className="flex flex-col gap-2 text-sm font-light text-gray-700">
              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="skincare" onChange={toggeleSubCategory} />
                Skincare
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="makeup" onChange={toggeleSubCategory} />
                Makeup
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="haircare" onChange={toggeleSubCategory} />
                Haircare
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="body" onChange={toggeleSubCategory} />
                Body
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="appliance" onChange={toggeleSubCategory} />
                Appliances
              </p>

              <p className="flex gap-2">
                <input type="checkbox" className="w-3" value="accessories" onChange={toggeleSubCategory} />
                Accessories
              </p>
            </div>
          </div>
        </div>

        {/* right side of collection */}
        <div className="flex-1">
          <div className="flex justify-between text-base sm:text-2xl b-4">
            <Title text1={"All"} text2={"COLLECTION"} />

            {/* product sort */}
            <select
              onChange={(e) => setSortType(e.target.value)}
              className="border-2 border-gray- text-sm px-2"
            >
              <option value="relavent">Sort by: Relevant</option>
              <option value="low-high">Sort by: Low to High</option>
              <option value="high-low">Sort by: High to Low</option>
            </select>
          </div>

          {/* map products */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6">
            {filterProducts.map((item, index) => (
              <ProductItems
                key={index}
                id={item._id}
                image={item.image}
                name={item.name}
                price={item.price}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Collection;
