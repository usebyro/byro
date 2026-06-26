"use client";
import React, { useState, useEffect } from "react";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  BoxIcon,
  UserMultipleIcon,
  PaintBrush01Icon,
  Dumbbell01Icon,
  MonitorDotIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import EventsContainer from "./EventsContainer";
import { fetchEventLocations } from "@/services/eventServices";

const LocationFilter = ({ selectedArea, onChange }) => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchEventLocations().then((data) => {
      if (isMounted) {
        setLocations(data);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!loading && locations.length === 0) return null;

  return (
    <div className="mb-6">
      <label className="font-medium text-sm text-[#1E1E1E] mb-2 block">
        Filter by location
      </label>
      <select
        value={selectedArea || ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        className="w-full sm:w-64 p-3 border border-[#B3BBC3] rounded-lg text-black"
      >
        <option value="">{loading ? "Loading locations..." : "All locations"}</option>
        {locations.map((loc) => (
          <option key={loc.value} value={loc.value}>
            {loc.label} ({loc.count})
          </option>
        ))}
      </select>
    </div>
  );
};

const CategoryCard = ({
  title,
  eventCount,
  icon: Icon,
  bgColor = "bg-blue-100",
  isSelected,
  onClick,
}) => {
  return (
    <div
      className={`${bgColor} rounded-2xl p-4 flex items-center justify-between hover:shadow-lg transition-shadow cursor-pointer`}
      onClick={onClick}
    >
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-blue-600 font-medium text-sm">{eventCount} Events</p>
      </div>
      <div className="text-4xl">
        <HugeiconsIcon icon={Icon} size={32} color="#2563eb" />
      </div>
    </div>
  );
};

export default function Categories() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);

  const handleCategoryClick = (category) => {
    setSelectedCategory(selectedCategory === category ? null : category);
    // Here you would typically trigger your filtering logic
    console.log("Filtering events by category:", category);
  };

  const categories = [
    {
      id: 1,
      title: "Web3 & Crypto",
      eventCount: "1k",
      icon: BoxIcon,
    },
    {
      id: 2,
      title: "Entertainment",
      eventCount: "1k",
      icon: UserMultipleIcon,
    },
    {
      id: 3,
      title: "Art & Culure",
      eventCount: "1k",
      icon: PaintBrush01Icon,
    },
    {
      id: 4,
      title: "Fitness",
      eventCount: "1k",
      icon: Dumbbell01Icon,
    },
    {
      id: 5,
      title: "Conference",
      eventCount: "1k",
      icon: MonitorDotIcon,
    },
    {
      id: 6,
      title: "Technology",
      eventCount: "1k",
      icon: Settings01Icon,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-10">
        <h1 className="font-bold text-xl sm:text-2xl lg:text-[28px] text-[#1E1E1E] mb-2 sm:mb-3">
          Browse Events
        </h1>
        <p className="font-medium text-[#707070] text-sm sm:text-base lg:text-[20px] leading-relaxed">
          Discover popular events near you, browse by category and explore for
          more options
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category, index) => (
          <CategoryCard
            key={index}
            title={category.title}
            eventCount={category.eventCount}
            icon={category.icon}
            bgColor={category.bgColor}
            isSelected={selectedCategory === category.id}
            onClick={() => handleCategoryClick(category.id)}
          />
        ))}
      </div>

      {selectedCategory && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-700">
            Filtering events by:{" "}
            <span className="font-semibold text-blue-600">
              {categories.find((cat) => cat.id === selectedCategory)?.title}
            </span>
          </p>
          <button
            onClick={() => setSelectedCategory(null)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear filter
          </button>
        </div>
      )}
      <LocationFilter selectedArea={selectedArea} onChange={setSelectedArea} />

      <div className="flex flex-col py-4 sm:py-6 gap-y-2 sm:gap-y-1">
        <p className="text-black font-extrabold text-2xl sm:text-3xl lg:text-[36px]">Feature Events</p>
        <div>
          <EventsContainer area={selectedArea} />
        </div>
      </div>
    </div>
  );
}
