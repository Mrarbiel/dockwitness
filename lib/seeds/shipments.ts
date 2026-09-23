import { Shipment } from "../types";

export const SEED_SHIPMENTS: Shipment[] = [
  {
    id: "shipment-po44880",
    poNumber: "44880",
    bolNumber: "NS-90270",
    carrierName: "NorthStar Freight",
    trailerNumber: "NST-2100",
    status: "COMPLETED",
    items: [
      {
        id: "item-po44880-1",
        sku: "AX-10",
        description: "Heavy Duty Bearings",
        expectedQty: 50,
        unit: "cartons",
      },
    ],
  },
  {
    id: "shipment-po44891",
    poNumber: "44891",
    bolNumber: "NS-90283",
    carrierName: "NorthStar Freight",
    trailerNumber: "NST-2208",
    status: "IN_PROGRESS",
    items: [
      {
        id: "item-po44891-1",
        sku: "AX-17",
        description: "Industrial Filter Cartons",
        expectedQty: 48,
        unit: "cartons",
      },
    ],
  },
  {
    id: "shipment-po44902",
    poNumber: "44902",
    bolNumber: "NS-90295",
    carrierName: "Midwest Express",
    trailerNumber: "MWE-4411",
    status: "PENDING",
    items: [
      {
        id: "item-po44902-1",
        sku: "BX-22",
        description: "Hydraulic Seals",
        expectedQty: 30,
        unit: "cartons",
      },
    ],
  },
  {
    id: "shipment-po44913",
    poNumber: "44913",
    bolNumber: "NS-90310",
    carrierName: "Apex Logistics",
    trailerNumber: "APX-8820",
    status: "PENDING",
    items: [
      {
        id: "item-po44913-1",
        sku: "CX-40",
        description: "Precision Fasteners",
        expectedQty: 60,
        unit: "cartons",
      },
    ],
  },
  {
    id: "shipment-po44924",
    poNumber: "44924",
    bolNumber: "NS-90325",
    carrierName: "Eagle Freight",
    trailerNumber: "EAG-1090",
    status: "PENDING",
    items: [
      {
        id: "item-po44924-1",
        sku: "DX-99",
        description: "Electronic Sensor Packs",
        expectedQty: 25,
        unit: "cartons",
      },
    ],
  },
];
