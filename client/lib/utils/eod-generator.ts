/**
 * Helper for End of Day Summary Generation
 */
import { query } from "@/lib/db/core";

export const generateEODSummary = async () => {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // 1. Get totals by payment method
    const sales = await query<{ payment_method: string; total: number }>(`
      SELECT payment_method, SUM(total_amount) as total 
      FROM sales 
      WHERE date(transaction_date) = ? AND _deleted = 0
      GROUP BY payment_method
    `, [today]);

    // 2. Get transaction count
    const countRes = await query<{ count: number }>(`
      SELECT COUNT(*) as count 
      FROM sales 
      WHERE date(transaction_date) = ? AND _deleted = 0
    `, [today]);

    // 3. Get top staff
    const staffRes = await query<{ name: string; total: number }>(`
      SELECT u.name, SUM(s.total_amount) as total 
      FROM sales s
      JOIN users u ON s.user_id = u.id
      WHERE date(s.transaction_date) = ? AND s._deleted = 0
      GROUP BY u.id
      ORDER BY total DESC
      LIMIT 1
    `, [today]);

    const summary = {
      totalSales: sales.reduce((acc, s) => acc + s.total, 0),
      cashSales: sales.find(s => s.payment_method === 'cash')?.total || 0,
      cardSales: sales.find(s => s.payment_method === 'card')?.total || 0,
      debtSales: sales.find(s => s.payment_method === 'credit')?.total || 0,
      transactionCount: countRes[0]?.count || 0,
      topStaff: staffRes[0] || { name: "N/A", total: 0 }
    };

    return summary;
  } catch (err) {
    console.error("EOD Generation failed:", err);
    throw err;
  }
};
