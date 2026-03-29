/**
 * Helper for Barcode Generation and Printing
 */

export interface BarcodeLabel {
  name: string;
  price: number;
  barcode: string;
  currency: string;
}

export const printBarcodeLabels = (labels: BarcodeLabel[], quantity: number = 1) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Print Barcodes</title>
        <style>
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 2mm;
          }
          .label {
            width: 46mm;
            height: 21mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 1px solid #eee;
            margin-bottom: 2mm;
            page-break-after: always;
          }
          .name {
            font-size: 8pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 1mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          .barcode-img {
            height: 10mm;
            width: 40mm;
            background: #eee; /* Placeholder for actual barcode */
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            font-size: 10pt;
            letter-spacing: 2px;
          }
          .price {
            font-size: 9pt;
            font-weight: bold;
            margin-top: 1mm;
          }
        </style>
      </head>
      <body>
        ${labels.map(label => Array(quantity).fill(0).map(() => `
          <div class="label">
            <div class="name">${label.name}</div>
            <div class="barcode-img">${label.barcode}</div>
            <div class="price">${label.currency} ${label.price.toLocaleString()}</div>
          </div>
        `).join('')).join('')}
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
