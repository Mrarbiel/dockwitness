-- Seed shipments and items for DockWitness

INSERT INTO shipments (id, po_number, bol_number, carrier_name, trailer_number, status)
VALUES
  ('shipment-po44880', '44880', 'NS-90270', 'NorthStar Freight', 'NST-2100', 'COMPLETED'),
  ('shipment-po44891', '44891', 'NS-90283', 'NorthStar Freight', 'NST-2208', 'IN_PROGRESS'),
  ('shipment-po44902', '44902', 'NS-90295', 'Midwest Express', 'MWE-4411', 'PENDING'),
  ('shipment-po44913', '44913', 'NS-90310', 'Apex Logistics', 'APX-8820', 'PENDING'),
  ('shipment-po44924', '44924', 'NS-90325', 'Eagle Freight', 'EAG-1090', 'PENDING')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO shipment_items (id, shipment_id, sku, description, expected_qty, unit)
VALUES
  ('item-po44880-1', 'shipment-po44880', 'AX-10', 'Heavy Duty Bearings', 50, 'cartons'),
  ('item-po44891-1', 'shipment-po44891', 'AX-17', 'Industrial Filter Cartons', 48, 'cartons'),
  ('item-po44902-1', 'shipment-po44902', 'BX-22', 'Hydraulic Seals', 30, 'cartons'),
  ('item-po44913-1', 'shipment-po44913', 'CX-40', 'Precision Fasteners', 60, 'cartons'),
  ('item-po44924-1', 'shipment-po44924', 'DX-99', 'Electronic Sensor Packs', 25, 'cartons')
ON CONFLICT DO NOTHING;
