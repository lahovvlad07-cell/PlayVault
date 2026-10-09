-- Набор 4 «Legends Collection» (аккаунт odindun123). Безопасно запускать повторно. Supabase, SQL Editor.
insert into packs(id,name,sub,price,cover_appid,cover_game)
values (4,'Legends Collection','Хиты на все вкусы: выживание, экшен, стратегии и классика',89,394360,'Hearts of Iron IV')
on conflict (id) do nothing;

-- Удаляем старые записи перед повторным вставлением (безопасно при re-run)
delete from pack_games where pack_id = 4;

insert into pack_games(pack_id,game,appid) values
  (4,'Ведьмак 3: Дикая Охота — Обновлённое издание',292030),
  (4,'Batman: The Telltale Series',278340),
  (4,'Batman: Arkham Asylum GOTY',35140),
  (4,'Batman: Arkham City GOTY',45510),
  (4,'Batman: Arkham Knight',208650),
  (4,'Bully: Scholarship Edition',12200),
  (4,'Dying Light',239140),
  (4,'Euro Truck Simulator 2',227300),
  (4,'Garry''s Mod',4000),
  (4,'Geometry Dash',322170),
  (4,'Hearts of Iron IV',394360),
  (4,'PAYDAY 2',218620),
  (4,'PC Building Simulator',621060),
  (4,'Sniper Elite 4',312670),
  (4,'Among Us',945360),
  (4,'The Binding of Isaac: Rebirth',250900),
  (4,'The Forest',242760),
  (4,'Who''s Your Daddy?!',318010),
  (4,'Don''t Starve Together',322330),
  (4,'Hotline Miami',219150),
  (4,'LIMBO',48000),
  (4,'Buckshot Roulette',2835570),
  (4,'Wreckfest',228380),
  (4,'Left 4 Dead',500),
  (4,'Left 4 Dead 2',550),
  (4,'HITMAN World of Assassination',1659040),
  (4,'Mortal Kombat X',307780),
  (4,'Metro 2033 Redux',286690),
  (4,'Metro: Last Light Complete Edition',287390),
  (4,'Life is Strange 2',532210),
  (4,'Portal',400),
  (4,'Portal 2',620),
  (4,'Dead by Daylight',381210),
  (4,'Sid Meier''s Civilization VI',289070),
  (4,'Sonic Mania',584400),
  (4,'Planet Zoo',703080),
  (4,'Ghostwire: Tokyo',1475810),
  (4,'People Playground',1118200),
  (4,'Slime Rancher',433340),
  (4,'POSTAL 2',223470),
  (4,'Warhammer 40,000: Gladius - Relics of War',489630),
  (4,'Green Hell',815370),
  (4,'Terraria',105600),
  (4,'Schedule I',3164500),
  (4,'theHunter: Call of the Wild',518790),
  (4,'Plague Inc: Evolved',246620),
  (4,'Car Mechanic Simulator 2018',645630),
  (4,'Bendy and the Dark Revival',1431850),
  -- Football Manager серия
  (4,'Football Manager 2020',1100600),
  (4,'Football Manager 2020 Touch',1100610),
  (4,'Football Manager 2021',1263850),
  (4,'Football Manager 2021 Touch',1263860),
  (4,'Football Manager 2022',1569040),
  (4,'Football Manager 2023',1904540),
  -- Обязательные добавки (appid уточни в Steam если показывает 0)
  (4,'Esports Manager 2026',2749950),
  (4,'Ultimate Zombie Defense',1035510)
on conflict do nothing;
