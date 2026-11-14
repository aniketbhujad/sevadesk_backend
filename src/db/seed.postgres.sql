-- SevaDesk Initial Seed Data for PostgreSQL / Neon
INSERT INTO services (category, name, default_charge, is_pinned, is_active) VALUES
-- Identity & Certificates
('Certificates & Identity', 'PAN Card – New PAN Application', 120.00, TRUE, TRUE),
('Certificates & Identity', 'PAN Correction', 120.00, TRUE, TRUE),
('Certificates & Identity', 'PAN Reprint', 70.00, FALSE, TRUE),
('Certificates & Identity', 'Income Certificate', 60.00, TRUE, TRUE),
('Certificates & Identity', 'Caste Certificate', 60.00, TRUE, TRUE),
('Certificates & Identity', 'Domicile Certificate', 60.00, TRUE, TRUE),
('Certificates & Identity', 'Birth Certificate', 50.00, FALSE, TRUE),
('Certificates & Identity', 'Death Certificate', 50.00, FALSE, TRUE),
('Certificates & Identity', 'Ration Card', 60.00, FALSE, TRUE),
('Certificates & Identity', 'Land Record Services', 50.00, FALSE, TRUE),
('Certificates & Identity', 'E-Stamp Services', 50.00, FALSE, TRUE),
('Certificates & Identity', 'DigiLocker Assistance', 30.00, FALSE, TRUE),
('Certificates & Identity', 'Voter ID Services', 50.00, FALSE, TRUE),
('Certificates & Identity', 'Passport Application', 200.00, TRUE, TRUE),
('Certificates & Identity', 'Passport Appointment Booking', 100.00, FALSE, TRUE),

-- Government Schemes
('Government Schemes', 'PM-KISAN Registration', 50.00, TRUE, TRUE),
('Government Schemes', 'Ayushman Bharat Card', 50.00, TRUE, TRUE),
('Government Schemes', 'E-Shram Registration', 50.00, TRUE, TRUE),
('Government Schemes', 'PM Fasal Bima Yojana', 50.00, FALSE, TRUE),
('Government Schemes', 'PM Awas Yojana', 50.00, FALSE, TRUE),
('Government Schemes', 'PM Ujjwala Yojana', 50.00, FALSE, TRUE),
('Government Schemes', 'Atal Pension Yojana', 50.00, FALSE, TRUE),
('Government Schemes', 'PM Shram Yogi Maandhan', 50.00, FALSE, TRUE),
('Government Schemes', 'Jeevan Pramaan', 50.00, TRUE, TRUE),
('Government Schemes', 'Scholarship Applications', 100.00, FALSE, TRUE),
('Government Schemes', 'Employment Registration', 50.00, FALSE, TRUE),

-- Banking & Financial Services
('Banking & Finance', 'AEPS Cash Withdrawal', 20.00, TRUE, TRUE),
('Banking & Finance', 'Cash Deposit', 20.00, FALSE, TRUE),
('Banking & Finance', 'Money Transfer', 30.00, TRUE, TRUE),
('Banking & Finance', 'Balance Enquiry', 10.00, FALSE, TRUE),
('Banking & Finance', 'Mini Statement', 10.00, FALSE, TRUE),
('Banking & Finance', 'DigiPay Services', 20.00, FALSE, TRUE),
('Banking & Finance', 'FASTag Services', 100.00, FALSE, TRUE),
('Banking & Finance', 'Insurance Premium Payment', 30.00, FALSE, TRUE),
('Banking & Finance', 'Life Insurance', 100.00, FALSE, TRUE),
('Banking & Finance', 'General Insurance', 100.00, FALSE, TRUE),
('Banking & Finance', 'Pension Services', 50.00, FALSE, TRUE),
('Banking & Finance', 'Loan Application Assistance', 150.00, FALSE, TRUE),
('Banking & Finance', 'CIBIL Services', 100.00, FALSE, TRUE),

-- Utility & Bill Payments
('Utility Bills', 'Electricity Bill Payment', 20.00, TRUE, TRUE),
('Utility Bills', 'Water Bill Payment', 20.00, FALSE, TRUE),
('Utility Bills', 'Gas Bill Payment', 20.00, FALSE, TRUE),
('Utility Bills', 'LPG Booking', 20.00, FALSE, TRUE),
('Utility Bills', 'Mobile Recharge', 10.00, TRUE, TRUE),
('Utility Bills', 'DTH Recharge', 10.00, FALSE, TRUE),
('Utility Bills', 'Broadband Bill Payment', 20.00, FALSE, TRUE),
('Utility Bills', 'FASTag Recharge', 20.00, FALSE, TRUE),
('Utility Bills', 'BBPS Bill Payment', 20.00, FALSE, TRUE),

-- Education & Examinations
('Education & Jobs', 'NIOS Admission', 200.00, FALSE, TRUE),
('Education & Jobs', 'IGNOU Admission', 150.00, FALSE, TRUE),
('Education & Jobs', 'NIELIT Courses', 150.00, FALSE, TRUE),
('Education & Jobs', 'PMGDISHA Digital Literacy', 50.00, FALSE, TRUE),
('Education & Jobs', 'Online Examination Registration', 100.00, FALSE, TRUE),
('Education & Jobs', 'Competitive Examination Forms', 100.00, TRUE, TRUE),
('Education & Jobs', 'Online Course Registration', 100.00, FALSE, TRUE),
('Education & Jobs', 'Government Job Applications', 100.00, TRUE, TRUE),

-- Travel & Ticketing
('Travel & Ticketing', 'Railway Ticket Booking', 50.00, TRUE, TRUE),
('Travel & Ticketing', 'Bus Ticket Booking', 40.00, FALSE, TRUE),
('Travel & Ticketing', 'Flight Ticket Booking', 150.00, FALSE, TRUE),
('Travel & Ticketing', 'Hotel Booking', 100.00, FALSE, TRUE),
('Travel & Ticketing', 'Tour Packages', 200.00, FALSE, TRUE),

-- Health & Agriculture
('Health & Agriculture', 'Telemedicine Consultation', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Health Insurance', 100.00, FALSE, TRUE),
('Health & Agriculture', 'Diagnostic Services', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Medicine Services', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Stree Swabhiman Services', 30.00, FALSE, TRUE),
('Health & Agriculture', 'Kisan Credit Card', 100.00, FALSE, TRUE),
('Health & Agriculture', 'Crop Insurance', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Soil Health Card', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Farmer Registration', 50.00, FALSE, TRUE),
('Health & Agriculture', 'Agricultural Advisory', 30.00, FALSE, TRUE),

-- Business & Tax
('Business & Tax', 'GST Registration', 500.00, FALSE, TRUE),
('Business & Tax', 'GST Filing', 300.00, FALSE, TRUE),
('Business & Tax', 'ITR Filing', 400.00, TRUE, TRUE),
('Business & Tax', 'FSSAI Registration', 350.00, FALSE, TRUE),
('Business & Tax', 'Udyam Registration', 150.00, FALSE, TRUE),

-- Printing & Desk Services
('Desk & Printing', 'Photocopy', 5.00, TRUE, TRUE),
('Desk & Printing', 'Printing', 10.00, TRUE, TRUE),
('Desk & Printing', 'Document Scanning', 20.00, TRUE, TRUE),
('Desk & Printing', 'Lamination', 30.00, FALSE, TRUE),
('Desk & Printing', 'Passport Size Photographs', 60.00, TRUE, TRUE),
('Desk & Printing', 'Online Form Filling', 80.00, TRUE, TRUE),
('Desk & Printing', 'Resume Creation', 100.00, FALSE, TRUE),
('Desk & Printing', 'Typing Services', 50.00, FALSE, TRUE),
('Desk & Printing', 'Documentation Services', 50.00, FALSE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  default_charge = EXCLUDED.default_charge,
  is_pinned = EXCLUDED.is_pinned;

-- Default Settings
INSERT INTO settings (setting_key, setting_value) VALUES
('centre_name', 'SevaDesk CSC Kendra'),
('centre_code', 'CSC-2026-IND'),
('centre_phone', '+91 9876543210'),
('centre_address', 'Shop No. 4, Main Bazar, Opposite Post Office'),
('receipt_footer', 'Thank you for visiting SevaDesk. Retain this receipt for your reference.'),
('currency', 'INR'),
('timezone', 'Asia/Kolkata'),
('sms_enabled', 'false'),
('sms_template', '{CENTRE_NAME}: Receipt {RECEIPT_NO}. Service: {SERVICE_NAME}. Total: Rs {TOTAL}. Paid: Rs {PAID_TO_DATE}. Balance: Rs {BALANCE}. Thank you.')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
