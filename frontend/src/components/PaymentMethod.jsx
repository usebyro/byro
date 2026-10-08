"use client";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { BadgeCheckIcon } from "@hugeicons/core-free-icons";
import CryptoPayment from "../../public/images/crypto-wallet.svg";
import CardPayment from "../../public/images/card-payment.svg";

export default function PaymentMethod({ selectedMethod, onSelect }) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="grid gap-4">
        <div
          onClick={() => onSelect("wallet")}
          className={`cursor-pointer border rounded-2xl p-5 items-center justify-between transition
            ${
              selectedMethod === "wallet"
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-blue-300"
            }
          `}
        >
          <div className="flex flex-col">
            <div className="flex flex-row items-center gap-5 justify-center ">
              <div>
                <Image
                  src={CryptoPayment}
                  alt="Crypto wallet"
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
              </div>

              <div>
                <h3 className="text-lg font-bold text-black">Connect Wallet</h3>
                <p className="text-xs font-medium text-black shadow-sm">
                  Pay with ETH, BTC, or other cryptocurrencies
                </p>
              </div>
              <div className="space-x-2">
                <span className="text-xs font-bold  rounded-3xl px-4 py-1 bg-[#d8cdd6] text-[#731D69]">
                  Web3
                </span>
                <span className="text-xs font-bold rounded-3xl px-4 py-1 bg-[#afd1f6] text-blue-600">
                  Instant
                </span>
              </div>
            </div>

            <hr className="my-2 border-gray-400" />

            <div className="flex gap-2 mt-2 text-xs text-gray-600 justify-between">
              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1  rounded-lg">Decentralized</span>
              </div>

              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1 ">Low fees</span>
              </div>

              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1 ">Privacy focused</span>
              </div>
            </div>
          </div>
        </div>

        <div
          onClick={() => onSelect("paystack")}
          className={`cursor-pointer border rounded-2xl p-5 flex items-center justify-between transition
            ${
              selectedMethod === "paystack"
                ? "border-green-500 bg-green-50"
                : "border-gray-200 hover:border-green-300"
            }
          `}
        >
          <div className="flex flex-col">
            <div className="flex flex-row items-center gap-5 justify-center ">
              <div>
                <Image
                  src={CardPayment}
                  alt="Paystack"
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
              </div>

              <div>
                <h3 className="text-lg font-bold text-black">Paystack</h3>
                <p className="text-xs font-medium text-black shadow-sm">
                  Secure payment gateway for African markets
                </p>
              </div>
              <div className="space-x-2">
                <span className="text-xs font-bold  rounded-3xl px-4 py-1 bg-[#d6f3e1] text-[#09D059]">
                  Trusted
                </span>
                <span className="text-xs font-bold rounded-3xl px-4 py-1 bg-[#fbdbc0] text-[#F5841F]">
                  Popular
                </span>
              </div>
            </div>

            <hr className="my-2 border-gray-400" />

            <div className="flex gap-2 mt-2 text-xs text-gray-600 justify-between">
              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1  rounded-lg">Bank Transfer</span>
              </div>

              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1 ">Mobile Money</span>
              </div>

              <div className="flex items-center gap-1">
                <HugeiconsIcon icon={BadgeCheckIcon} size={20} color="#22c55e" />
                <span className="px-2 py-1 ">Card Payment</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
