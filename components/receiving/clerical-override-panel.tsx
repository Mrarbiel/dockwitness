"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Edit3, RotateCcw, Check, X, Minus, Plus } from "lucide-react";

interface ClericalOverridePanelProps {
  currentQty: number | null;
  spokenQty: number | null;
  isOverridden: boolean;
  onConfirmOverride: (newQty: number, reason: string) => void;
  onResetToSpoken: () => void;
}

export function ClericalOverridePanel({
  currentQty,
  spokenQty,
  isOverridden,
  onConfirmOverride,
  onResetToSpoken,
}: ClericalOverridePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState<string>(String(currentQty ?? 0));
  const [reason, setReason] = useState<string>("Physical recount on dock");

  const getValidationError = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) {
      return "Quantity cannot be empty.";
    }
    const num = Number(trimmed);
    if (isNaN(num)) {
      return "Quantity must be a valid number.";
    }
    if (trimmed.includes(".") || !Number.isInteger(num)) {
      return "Quantity must be a whole number.";
    }
    if (num < 0) {
      return "Quantity cannot be negative.";
    }
    if (num > 100000) {
      return "Quantity exceeds the supported receiving limit.";
    }
    return null;
  };

  const validationError = getValidationError(inputValue);

  const handleOpen = () => {
    setInputValue(String(currentQty ?? spokenQty ?? 0));
    setIsOpen(true);
  };

  const handleConfirm = () => {
    const err = getValidationError(inputValue);
    if (err) return;
    const parsed = parseInt(inputValue.trim(), 10);
    onConfirmOverride(parsed, reason);
    setIsOpen(false);
  };

  const handleReset = () => {
    onResetToSpoken();
    setIsOpen(false);
  };

  const hasSpokenOrCurrent = spokenQty !== null || currentQty !== null;
  const buttonLabel = hasSpokenOrCurrent ? "Correct Count" : "Enter Count Manually";

  if (!isOpen) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleOpen}
          className="border-slate-700 bg-slate-800/80 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          <Edit3 className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
          {buttonLabel}
        </Button>

        {isOverridden && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="text-xs text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to Spoken ({spokenQty})
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-500/40 bg-slate-950 p-4 shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
          Clerical Count Adjustment
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setIsOpen(false)}
          className="h-6 w-6 p-0 text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3.5 flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 p-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const currentNum = parseInt(inputValue, 10);
              const nextVal = isNaN(currentNum) ? 0 : Math.max(0, currentNum - 1);
              setInputValue(String(nextVal));
            }}
            className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-20 bg-transparent text-center font-mono text-lg font-bold text-white outline-none"
            placeholder="0"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              const currentNum = parseInt(inputValue, 10);
              const nextVal = isNaN(currentNum) ? 1 : Math.min(100000, currentNum + 1);
              setInputValue(String(nextVal));
            }}
            className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Adjustment Reason
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
          >
            <option value="Physical recount on dock">Physical recount on dock</option>
            <option value="Speech recognition misheard count">Speech recognition misheard count</option>
            <option value="Packaging repackaged/consolidated">Packaging repackaged/consolidated</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {validationError && (
        <div className="mt-2 text-xs font-semibold text-rose-400" data-testid="quantity-validation-error">
          {validationError}
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setIsOpen(false)}
          className="text-xs text-slate-400 hover:text-white"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={Boolean(validationError)}
          onClick={handleConfirm}
          className="bg-amber-500 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
        >
          <Check className="mr-1.5 h-3.5 w-3.5" />
          Confirm Count Correction
        </Button>
      </div>
    </div>
  );
}
