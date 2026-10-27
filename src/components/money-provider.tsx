"use client";
import { createContext, useContext, type ReactNode } from "react";
import { usdMoney, type Money } from "@/lib/display-money";

const MoneyContext = createContext<Money>(usdMoney());

/** How amounts are shown on this page, for Client Components; Server Components use `getMoney()`. */
export function MoneyProvider({ money, children }: { money: Money; children: ReactNode }) {
  return <MoneyContext value={money}>{children}</MoneyContext>;
}

export function useMoney() {
  return useContext(MoneyContext);
}
