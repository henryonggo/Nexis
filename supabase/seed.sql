-- Nexis local seed data.
-- Pre-populates Indonesian compliance reference data (PTKP, Tax Brackets, BPJS, PPh 21 TER).
--
TRUNCATE ptkp_rates, tax_brackets, bpjs_config, ter_rates, minimum_wages CASCADE;

-- 1. PTKP Rates
insert into ptkp_rates (status, annual_amount, effective_from) values ('TK/0', 54000000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('TK/1', 58500000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('TK/2', 63000000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('TK/3', 67500000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('K/0', 58500000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('K/1', 63000000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('K/2', 67500000, '2024-01-01');
insert into ptkp_rates (status, annual_amount, effective_from) values ('K/3', 72000000, '2024-01-01');

-- 2. Tax Brackets (progressive annual PKP)
insert into tax_brackets (lower_bound, upper_bound, rate_bps, effective_from) values (0, 60000000, 500, '2024-01-01');
insert into tax_brackets (lower_bound, upper_bound, rate_bps, effective_from) values (60000001, 250000000, 1500, '2024-01-01');
insert into tax_brackets (lower_bound, upper_bound, rate_bps, effective_from) values (250000001, 500000000, 2500, '2024-01-01');
insert into tax_brackets (lower_bound, upper_bound, rate_bps, effective_from) values (500000001, 5000000000, 3000, '2024-01-01');
insert into tax_brackets (lower_bound, upper_bound, rate_bps, effective_from) values (5000000001, NULL, 3500, '2024-01-01');

-- 3. BPJS Config
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('kes_employee', 100, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('kes_employer', 400, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jht_employee', 200, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jht_employer', 370, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jp_employee', 100, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jp_employer', 200, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkm_employer', 30, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('kes_cap', NULL, 12000000, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jp_cap', NULL, 10547400, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkk_very_low', 24, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkk_low', 54, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkk_medium', 89, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkk_high', 127, NULL, '2024-01-01');
insert into bpjs_config (key, rate_bps, amount, effective_from) values ('jkk_very_high', 174, NULL, '2024-01-01');

-- 4. PPh 21 TER - Category A
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 0, 5400000, 0, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 5400001, 5650000, 25, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 5650001, 5950000, 50, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 5950001, 6300000, 75, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 6300001, 6750000, 100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 6750001, 7500000, 125, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 7500001, 8550000, 150, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 8550001, 9650000, 175, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 9650001, 10050000, 200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 10050001, 10350000, 225, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 10350001, 10700000, 250, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 10700001, 11050000, 300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 11050001, 11600000, 350, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 11600001, 12500000, 400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 12500001, 13750000, 500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 13750001, 15100000, 600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 15100001, 16950000, 700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 16950001, 19100000, 800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 19100001, 21100000, 900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 21100001, 23300000, 1000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 23300001, 25300000, 1100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 25300001, 28100000, 1200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 28100001, 31500000, 1300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 31500001, 35100000, 1400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 35100001, 39100000, 1500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 39100001, 43850000, 1600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 43850001, 47800000, 1700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 47800001, 51400000, 1800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 51400001, 56300000, 1900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 56300001, 62200000, 2000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 62200001, 68600000, 2100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 68600001, 77500000, 2200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 77500001, 89000000, 2300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 89000001, 103000000, 2400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 103000001, 125000000, 2500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 125000001, 157000000, 2600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 157000001, 206000000, 2700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 206000001, 337000000, 2800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 337000001, 454000000, 2900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 45400001, 550000000, 3000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 550000001, 695000000, 3100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 695000001, 910000000, 3200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 910000001, 1400000000, 3300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('A', 1400000001, NULL, 3400, '2024-01-01');

-- 5. PPh 21 TER - Category B
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 0, 6200000, 0, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 6200001, 6500000, 25, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 6500001, 6850000, 50, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 6850001, 7300000, 75, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 7300001, 7850000, 100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 7850001, 8500000, 125, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 8500001, 9250000, 150, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 9250001, 10100000, 175, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 10100001, 11100000, 200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 11100001, 11600000, 225, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 11600001, 12500000, 250, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 12500001, 13750000, 300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 13750001, 15100000, 350, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 15100001, 16950000, 400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 16950001, 19100000, 500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 19100001, 21100000, 600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 21100001, 23300000, 700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 23300001, 25300000, 800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 25300001, 28100000, 900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 28100001, 31500000, 1000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 31500001, 35100000, 1100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 35100001, 39100000, 1200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 39100001, 43850000, 1300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 43850001, 47800000, 1400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 47800001, 51400000, 1500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 51400001, 56300000, 1600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 56300001, 62200000, 1700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 62200001, 68600000, 1800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 68600001, 77500000, 1900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 77500001, 89000000, 2000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 89000001, 103000000, 2100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 103000001, 125000000, 2200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 12500001, 157000000, 2300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 157000001, 206000000, 2400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 206000001, 337000000, 2500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 337000001, 454000000, 2600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 454000001, 550000000, 2700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 550000001, 695000000, 2800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 695000001, 910000000, 2900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 910000001, 1400000000, 3000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('B', 1400000001, NULL, 3400, '2024-01-01');

-- 6. PPh 21 TER - Category C
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 0, 6600000, 0, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 6600001, 6950000, 25, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 6950001, 7350000, 50, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 7350001, 7800000, 75, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 7800001, 8350000, 100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 8350001, 9050000, 125, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 9050001, 9850000, 150, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 9850001, 10750000, 175, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 10750001, 11850000, 200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 11850001, 13050000, 225, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 13050001, 14350000, 250, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 14350001, 15650000, 300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 15650001, 17100000, 350, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 17100001, 18950000, 400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 18950001, 21850000, 500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 21850001, 24500000, 600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 24500001, 28300000, 700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 28300001, 34600000, 800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 34600001, 44700000, 900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 44700001, 50000000, 1000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 50000001, 54400000, 1100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 54400001, 59700000, 1200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 59700001, 65200000, 1300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 65200001, 71300000, 1400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 71300001, 78400000, 1500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 78400001, 86000000, 1600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 86000001, 94600000, 1700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 94600001, 104000000, 1800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 104000001, 114500000, 1900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 114500001, 126000000, 2000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 126000001, 138500000, 2100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 138500001, 152500000, 2200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 152500001, 167500000, 2300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 167500001, 184000000, 2400, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 184000001, 211500000, 2500, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 211500001, 251500000, 2600, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 251500001, 311500000, 2700, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 311500001, 482000000, 2800, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 48200001, 604000000, 2900, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 604000001, 707000000, 3000, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 707000001, 869000000, 3100, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 869000001, 1110000000, 3200, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 1110000001, 1637000000, 3300, '2024-01-01');
insert into ter_rates (category, income_lower, income_upper, rate_bps, effective_from) values ('C', 1637000001, NULL, 3400, '2024-01-01');

-- 7. Minimum Wages (UMR)
insert into minimum_wages (region, amount, effective_from) values ('DKI Jakarta', 5067381, '2024-01-01');
insert into minimum_wages (region, amount, effective_from) values ('DKI Jakarta', 5729876, '2026-01-01');
