export type QuoteUnits = {
  amountPaise: number;
  billableUnits: number;
  unit: "pages" | "sheets";
};

export function calculateQuote(
  pageCount: number,
  copies: number,
  ratePaise: number,
  duplex: boolean,
): QuoteUnits {
  const billableUnits = duplex ? Math.ceil(pageCount / 2) : pageCount;
  return {
    amountPaise: billableUnits * copies * ratePaise,
    billableUnits,
    unit: duplex ? "sheets" : "pages",
  };
}
