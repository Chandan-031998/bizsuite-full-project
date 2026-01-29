// client/src/components/common/StatCard.jsx
import React from "react";

const toneGradients = {
  default: "from-indigo-500 to-sky-500",
  green: "from-emerald-500 to-teal-400",
  red: "from-rose-500 to-orange-400",
  amber: "from-amber-500 to-orange-400",
};

const StatCard = ({
  label,
  value,
  tone = "default",
  format = "currency", // "currency" | "number"
  suffix = "",
}) => {
  const gradient = toneGradients[tone] || toneGradients.default;

  const numeric = Number(value || 0);

  const formatted =
    format === "number"
      ? new Intl.NumberFormat("en-IN").format(numeric)
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 0,
        }).format(isNaN(numeric) ? 0 : numeric);

  return (
    <div className="bg-white/90 border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex flex-col justify-between">
      <div className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-1 mb-3 text-2xl font-semibold text-slate-800">
        {formatted}
        {suffix && (
          <span className="ml-1 text-xs font-medium text-slate-500">
            {suffix}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full w-3/4 bg-gradient-to-r ${gradient} rounded-full`}
        />
      </div>
    </div>
  );
};

export default StatCard;
