const LIVE_ITEM = "si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)";
const LIVE_SERVICE = "ss.sale_id = s.id AND (ss._deleted = 0 OR ss._deleted IS NULL)";

/** Names of every live product and service line on sale `s`, joined by `||`. */
// products joined unfiltered on purpose: client/AGENTS.md, deleted-product-sales-history.test.ts.
export const SALE_LINE_NAMES_SQL = `(SELECT GROUP_CONCAT(line_name, '||') FROM (
        SELECT pr.name AS line_name FROM sale_items si JOIN products pr ON si.product_id = pr.id WHERE ${LIVE_ITEM}
        UNION ALL
        SELECT ss.service_name FROM sale_services ss WHERE ${LIVE_SERVICE}
      ))`;

/** Number of live product and service lines on sale `s`. */
export const SALE_LINE_COUNT_SQL = `((SELECT COUNT(*) FROM sale_items si WHERE ${LIVE_ITEM})
        + (SELECT COUNT(*) FROM sale_services ss WHERE ${LIVE_SERVICE}))`;

/** Units sold across live product and service lines on sale `s`. */
export const SALE_UNIT_COUNT_SQL = `(COALESCE((SELECT SUM(quantity) FROM sale_items si WHERE ${LIVE_ITEM}), 0)
        + COALESCE((SELECT SUM(quantity) FROM sale_services ss WHERE ${LIVE_SERVICE}), 0))`;
