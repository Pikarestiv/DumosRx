export interface FastMoverRow {
  id: string;
  name: string;
  genericName?: string;
  category_id?: string;
  soldQuantity: number;
  revenue: number;
  prevQuantity: number;
}

export interface FastMover extends FastMoverRow {
  percentageChange: number;
}
