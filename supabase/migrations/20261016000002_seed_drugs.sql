-- =====================================================================
-- VetChaqiruv — boshlang'ich dorilar ro'yxati
-- Narxlar taxminiy (so'm). Dorixonalar o'z narxini "Ombor" bo'limida kiritadi.
-- Yangi dori qo'shish: shu faylga qator qo'shib qayta ishga tushiring.
-- =====================================================================
insert into public.drugs (id, name, form, default_price, sort) values
  ('oks',    'Oksitetratsiklin 20% LA',        'in''eksiya, 100 ml',      68000, 10),
  ('pen',    'Penstrep-400',                   'in''eksiya, 100 ml',      54000, 20),
  ('tilo',   'Tilozin 200',                    'in''eksiya, 100 ml',      72000, 30),
  ('gen',    'Gentamitsin 4%',                 'in''eksiya, 100 ml',      36000, 40),
  ('enro',   'Enrofloksatsin 10%',             'ichimlik suviga, 100 ml', 48000, 50),
  ('iver',   'Ivermektin 1%',                  'in''eksiya, 50 ml',       39000, 60),
  ('alb',    'Albendazol 10%',                 'suspenziya, 1 l',         85000, 70),
  ('tolt',   'Toltrazuril 2.5%',               'ichimlik suviga, 1 l',   145000, 80),
  ('mel',    'Meloksikam 2%',                  'in''eksiya, 100 ml',     112000, 90),
  ('flun',   'Fluniksin',                      'in''eksiya, 100 ml',      98000, 100),
  ('deks',   'Deksametazon 0.4%',              'in''eksiya, 50 ml',       27000, 110),
  ('kat',    'Butafosfan + B12',               'in''eksiya, 100 ml',      96000, 120),
  ('trivit', 'Trivit (A, D3, E)',              'in''eksiya, 100 ml',      34000, 130),
  ('ca',     'Kalsiy borglyukonat',            'in''eksiya, 400 ml',      42000, 140),
  ('gluk',   'Glyukoza 40%',                   'in''eksiya, 400 ml',      21000, 150),
  ('tim',    'Timpanol',                       'ichishga, 100 ml',        31000, 160),
  ('elek',   'Elektrolit kukuni',              'poroshok, 100 g',         18000, 170),
  ('mast',   'Yelin ichiga antibiotik shprits','8 dona',                 128000, 180),
  ('okst',   'Oksitotsin',                     'in''eksiya, 10 ml',       22000, 190),
  ('yod',    'Yod eritmasi 5%',                'tashqi, 100 ml',          12000, 200)
on conflict (id) do update set
  name = excluded.name, form = excluded.form, default_price = excluded.default_price, sort = excluded.sort;
