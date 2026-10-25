-- Yoga content: Yoga with Adriene, embedded not re-hosted.
--
-- GENERATED. Every playlist id and video id here was verified against
-- YouTube's oEmbed endpoint at seed time: a 200 response means the video
-- exists AND permits embedding. Nothing is hand-typed or guessed, because a
-- fabricated id produces a dead player with no way for the user to recover.
--
-- Videos can still be removed or have embedding revoked later, which is why
-- the player falls back to an "Open on YouTube" link rather than a black box.
-- See SPEC.md section 9.3.

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('home-30-day', 'HOME - A 30 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzzFFfpiil94CUrWKVMaqmkm', 'Adriene''s classic beginner journey. Start here if you have never done yoga.', 'beginner'::fitness_level, true, 1)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'home-30-day'), 'KWBfQjuwp4E', 'Home - Day 0 - Welcome Home  |  30 Days of Yoga', 6, 0, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'home-30-day'), '--jhKVdZOJM', 'Home - Day 1 - Recognize  |  30 Days of Yoga', 43, 1, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'UcZ3O1e0ejA', 'Home - Day 2 - Intend  |  30 Days of Yoga', 28, 2, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'ejDUxMbsjOo', 'Home - Day 3 - Awaken  |  30 Days of Yoga', 26, 3, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'home-30-day'), '8PO95Jy8LUQ', 'Home - Day 4 - Activate  |  30 Days of Yoga', 22, 4, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'NVeNMX8WDeQ', 'Home - Day 5 - Soften  |  30 Days of Yoga', 26, 5, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'qIWOSQZAvTo', 'Home - Day 6 - Ignite  |  30 Days of Yoga', 26, 6, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'iQKrWQB_Mi4', 'Home - Day 7 - Stretch  |  30 Days of Yoga', 26, 7, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'b5fxInaetEQ', 'Home - Day 8 - Heal  |  30 Days of Yoga', 26, 8, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'sT5OAAYPHkc', 'Home - Day 9 - Inquire  |  30 Days of Yoga', 27, 9, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'VPMqn8OJii8', 'Home - Day 10 - Ground  |  30 Days of Yoga', 18, 10, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'm0PAyp7QM1M', 'Home - Day 11 - Dig  |  30 Days of Yoga', 21, 11, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'E_Xxqv_tBgU', 'Home - Day 12 - Nurture  |  30 Days of Yoga', 22, 12, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'home-30-day'), '9DlVaq_-KjA', 'Home - Day 13 - Grow  | 30 Days of Yoga', 18, 13, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'A2I-G651IQg', 'Home - Day 14 - Return  |  30 Days of Yoga', 27, 14, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'aU0KYsCTbyM', 'Home - Day 15 - Reset  |  30 Days of Yoga', 25, 15, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'home-30-day'), '8KrY1ePvguw', 'Home - Day 16 - Savor  |  30 Days of Yoga', 22, 16, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'LGEMzfXfj-g', 'Home - Day 17 - Synchronize  |  30 Days of Yoga', 30, 17, '{}'::text[], 17),
  ((select id from yoga_playlists where slug = 'home-30-day'), '79gRqVTtTK0', 'Home - Day 18 - Believe  |  30 Days of Yoga', 28, 18, '{}'::text[], 18),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'cQQvsEUlhfM', 'Home - Day 19 - Balance  |  30 Days of Yoga', 31, 19, '{}'::text[], 19),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'Dh5oLHetZ1Y', 'Home - Day 20 - Still  |  30 Days of Yoga', 23, 20, '{}'::text[], 20),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'O8BlybmA9SU', 'Home - Day 21 - Boost  |  30 Days of Yoga', 26, 21, '{}'::text[], 21),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'mdsZzKK19Ko', 'Home - Day 22 - Stir  |  30 Days of Yoga', 33, 22, '{}'::text[], 22),
  ((select id from yoga_playlists where slug = 'home-30-day'), '-1jGG62K0Dk', 'Home - Day 23 - Focus  |  30 Days of Yoga', 20, 23, '{}'::text[], 23),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'jQPraKYoH54', 'Home - Day 24 - Uplift  |  30 Days of Yoga', 16, 24, '{}'::text[], 24),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'ZZ7ID_-8OkY', 'Unwind  -  Home - Day 25  |  30 Days of Yoga', 18, 25, '{}'::text[], 25),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'O0gD1v8ob-s', 'Keep - Home - Day 26  |  30 Days of Yoga', 22, 26, '{}'::text[], 26),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'tYfg3x9oFgo', 'Home - Day 27 - Integrate  |  30 Days of Yoga', 26, 27, '{}'::text[], 27),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'Lnvt4jj9Ajg', 'Home - Day 28 - Nourish  |  30 Days of Yoga', 18, 28, '{}'::text[], 28),
  ((select id from yoga_playlists where slug = 'home-30-day'), 'xAc-c7-suRc', 'Home - Day 29 - Intuit  |  30 Days of Yoga', 26, 29, '{}'::text[], 29),
  ((select id from yoga_playlists where slug = 'home-30-day'), '4VSqbSCcvuU', 'Home - Day 30 - Journey  |  30 Days of Yoga', 42, 30, '{}'::text[], 30)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('breath-30-day', 'BREATH - A 30 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzzJ4NSTesh4xRWg4ZWNz5s4', 'Thirty days centred on the breath. Gentle, and a good second series.', 'beginner'::fitness_level, true, 2)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'JpWa4LtKe4c', 'Breath - A 30 Day Yoga Journey  |  Yoga With Adriene', 3, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'AjhvRX57XkE', 'Welcome to BREATH - A 30 Day Yoga Journey  |  Yoga With Adriene', 5, null, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'ZSIp00SewO8', 'Day 1 - Invite  |  BREATH - A 30 Day Yoga Journey', 48, 1, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'GaL3YF1vY2k', 'Day 2 - Arrive | BREATH - A 30 Day Yoga Journey', 38, 2, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'hJjqx6YlcWs', 'Day 3 - Anchor | BREATH - A 30 Day Yoga Journey', 35, 3, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '-rjYMUNJsO0', 'Day 4 - Listen | BREATH - A 30 Day Yoga Journey', 27, 4, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'jWMtgM_8jAE', 'Day 5 - Replenish |  BREATH - A 30 Day Yoga Journey', 24, 5, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'aAVOdXvdtk8', 'Day 6 - Burn |  BREATH - A 30 Day Yoga Journey', 28, 6, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'uxWJRKyUNZo', 'Day 7 - Synchronize  |  BREATH - A 30 Day Yoga Journey', 28, 7, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '18oXIcsTpUY', 'Day 8 - Snuggle  |  BREATH - A 30 Day Yoga Journey', 33, 8, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'JAOUZR3Jw3E', 'Day 9 - Balance |  BREATH - A 30 Day Yoga Journey', 26, 9, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'upiiNyibfF0', 'Day 10 - Connect  |  BREATH - A 30 Day Yoga Journey', 22, 10, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'hmUAQIxZwXw', 'Day 11 - Flow |  BREATH - A 30 Day Yoga Journey', 22, 11, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '5sTZMSGurlg', 'Day 12 - Drop  |  BREATH - A 30 Day Yoga Journey', 19, 12, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '_O0z9EBEO6g', 'Day 13 - Feel  |  BREATH - A 30 Day Yoga Journey', 26, 13, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'PVJtNPVq26Q', 'Day 14 - Space |  BREATH - A 30 Day Yoga Journey', 36, 14, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'uZ0J5Sj_0Yw', 'Day 15 - Enter  |  BREATH - A 30 Day Yoga Journey', 23, 15, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'mnw2-SUbcCI', 'Day 16 - Discipline |  BREATH - A 30 Day Yoga Journey', 28, 16, '{}'::text[], 17),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'sqbavY4lOyI', 'Day 17 - Explore |  BREATH - A 30 Day Yoga Journey', 33, 17, '{}'::text[], 18),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'RfJseP0-Tys', 'Day 18 - Center  |  BREATH - A 30 Day Yoga Journey', 37, 18, '{}'::text[], 19),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'z0q2K-ot_R4', 'Day 19 - Strength |  BREATH - A 30 Day Yoga Journey', 24, 19, '{}'::text[], 20),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '_aCNiRAyOlI', 'Day 20 - Pause |  BREATH - A 30 Day Yoga Journey', 16, 20, '{}'::text[], 21),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'iTvFko3tOKY', 'Day 21 - Control |  BREATH - A 30 Day Yoga Journey', 21, 21, '{}'::text[], 22),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'T1VJBw0vL_Q', 'Day 22 - Renew |  BREATH - A 30 Day Yoga Journey', 23, 22, '{}'::text[], 23),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'mfjo2dCuU9s', 'Day 23 - Dedicate |  BREATH - A 30 Day Yoga Journey', 30, 23, '{}'::text[], 24),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'd1jKp2mZkSQ', 'Day 24 - Rejuvenate |  BREATH - A 30 Day Yoga Journey', 25, 24, '{}'::text[], 25),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'DRNdD9c7HMc', 'Day 25 - Love |  BREATH - A 30 Day Yoga Journey', 24, 25, '{}'::text[], 26),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'jc27Unjv_tM', 'Day 26 - Expand |  BREATH - A 30 Day Yoga Journey', 17, 26, '{}'::text[], 27),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '-j9o8sxTnbs', 'Day 27  - Heal |  BREATH - A 30 Day Yoga Journey', 19, 27, '{}'::text[], 28),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'ZvX-N5c0pVA', 'Day 28 - Trust |  BREATH - A 30 Day Yoga Journey', 37, 28, '{}'::text[], 29),
  ((select id from yoga_playlists where slug = 'breath-30-day'), '_j0zxr9RZwM', 'Day 29 - Believe |  BREATH - A 30 Day Yoga Journey', 29, 29, '{}'::text[], 30),
  ((select id from yoga_playlists where slug = 'breath-30-day'), 'TVwyEtS_7OQ', 'Day 30 - Begin |  BREATH - A 30 Day Yoga Journey', 51, 30, '{}'::text[], 31)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('move-30-day', 'MOVE - A 30 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-Uzyp5P3Vcuv5qCHQOC8W6grN', 'Thirty days with more pace, for when the basics feel comfortable.', 'intermediate'::fitness_level, true, 3)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'move-30-day'), 'Pmlh6AHFW0E', 'Welcome to MOVE - A 30 Day Yoga Journey  |  Yoga With Adriene', 7, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'tLcHTdzykgk', 'Day 1 - Here  |  MOVE - A 30 Day Yoga Journey', 29, 1, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'GcclN_MKWsI', 'Day 2 - Open  |  MOVE - A 30 Day Yoga Journey', 28, 2, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'qj9YLsjdAJg', 'Day 3 - Stretch  |  MOVE - A 30 Day Yoga Journey', 25, 3, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'wDIr92u-2cY', 'Day 4 - Flow  |  MOVE - A 30 Day Yoga Journey', 29, 4, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'HnEqUkVNmPU', 'Day 5 - Deepen  |  MOVE - A 30 Day Yoga Journey', 28, 5, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'dWpplJRh4xw', 'Day 6 - Light  |  MOVE - A 30 Day Yoga Journey', 23, 6, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'I1VUTQCCgdw', 'Day 7 - Nourish  |  MOVE - A 30 Day Yoga Journey', 24, 7, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'KxlAXZUmevo', 'Day 8 - Rest  |  MOVE - A 30 Day Yoga Journey', 32, 8, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'EZ8H7AvIF3k', 'Day 9 - Curiosity  |  MOVE - A 30 Day Yoga Journey', 22, 9, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'move-30-day'), '6xMcGzuORCM', 'Day 10 - Uplift  |  MOVE - A 30 Day Yoga Journey', 30, 10, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'move-30-day'), '6s5MEhUblzQ', 'Day 11 - Mobility  |  MOVE - A 30 Day Yoga Journey', 24, 11, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'HUAvxMQWg1k', 'Day 12 - Focus  |  MOVE - A 30 Day Yoga Journey', 24, 12, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'Ev9cKmJZy8c', 'Day 13 - Flight  |  MOVE - A 30 Day Yoga Journey', 21, 13, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'KtJPbD8eUTU', 'Day 14 - Closer  |  MOVE - A 30 Day Yoga Journey', 23, 14, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'K1RGa6sW4ME', 'Day 15 - Reset  |  MOVE - A 30 Day Yoga Journey', 20, 15, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'vACdgwUuXII', 'Day 16 - Anchor  |  MOVE - A 30 Day Yoga Journey', 22, 16, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'GfsnsS0Bq7I', 'Day 17 - Snuggle  |  MOVE - A 30 Day Yoga Journey', 22, 17, '{}'::text[], 17),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'qWwN8DnEBBA', 'Day 18 - Savor  |  MOVE - A 30 Day Yoga Journey', 30, 18, '{}'::text[], 18),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'YqyYCmem2oM', 'Day 19 - Explore  |  MOVE - A 30 Day Yoga Journey', 20, 19, '{}'::text[], 19),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'JnXP-60Og7E', 'Day 20 - Ritual  |  MOVE - A 30 Day Yoga Journey', 24, 20, '{}'::text[], 20),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'hPyBU52P_Xc', 'Day 21 - Connect  |  MOVE - A 30 Day Yoga Journey', 13, 21, '{}'::text[], 21),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'CEbfCdeLt9E', 'Day 22 - Courage  |  MOVE - A 30 Day Yoga Journey', 21, 22, '{}'::text[], 22),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'IHow3Qt86jc', 'Day 23 - Soften  |  MOVE - A 30 Day Yoga Journey', 26, 23, '{}'::text[], 23),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'lwmy2lGGy3A', 'Day 24 - Process  |  MOVE - A 30 Day Yoga Journey', 22, 24, '{}'::text[], 24),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'JhU16ECcd5Y', 'Day 25 - Release  |  MOVE - A 30 Day Yoga Journey', 21, 25, '{}'::text[], 25),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'O7unqSzJhuM', 'Day 26 - Love  |  MOVE - A 30 Day Yoga Journey', 22, 26, '{}'::text[], 26),
  ((select id from yoga_playlists where slug = 'move-30-day'), '8CUzG_ny6sg', 'Day 27 - Strong  |  MOVE - A 30 Day Yoga Journey', 22, 27, '{}'::text[], 27),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'uIfX-EqwWcM', 'Move - Day 28 - TLC', 18, 28, '{}'::text[], 28),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'Ro_nYcdGVgM', 'Move - Day 29 - Trust', 26, 29, '{}'::text[], 29),
  ((select id from yoga_playlists where slug = 'move-30-day'), 'QUPAFGv72PM', 'Move - Day 30 - Choose', 29, 30, '{}'::text[], 30)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('center-30-day', 'CENTER - A 30 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-Uzx-IzGg48K4aHGyBwtPh7Sw', 'Thirty days on balance and focus.', 'intermediate'::fitness_level, true, 4)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'center-30-day'), 'LTdBUmHDA4s', 'CENTER - A 30 Day Yoga Journey', 4, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'center-30-day'), '7vZOuClmaxk', 'Center - Day 0 - Welcome', 10, 0, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'dlkG7LQJjY0', 'Center - Day 1 - Show Up', 34, 1, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'XHegE9h0ZvA', 'Center - Day 2 - Listen', 26, 2, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'XerZZ2gbY38', 'Center - Day 3 - Shift', 25, 3, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'NdH3XeKbhvQ', 'Center - Day 4 - Root', 29, 4, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'mXG4p5cuR3g', 'Center - Day 5 - Hug', 28, 5, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'h6D7MGLs4Po', 'Center - Day 6 - Fan', 20, 6, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'UhK6T9ReRwI', 'Center - Day 7 - Flow', 23, 7, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'center-30-day'), '8WLVkyf2Ojg', 'Center - Day 8 - Melt', 30, 8, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'FHRjpS11CbE', 'Center - Day 9 - Corazón', 24, 9, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'giSo0qQIscE', 'Center - Day 10 - Energy', 19, 10, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'kW8Fe9O2mPs', 'Center - Day 11 - Rinse', 24, 11, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'tAui_7GMF2w', 'Center - Day 12 - Unwind', 21, 12, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'PAuo_9d3FSk', 'Center - Day 13 - Trust', 21, 13, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'aYDRQ4mqNgs', 'Center - Day 14 - Stretch', 21, 14, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'center-30-day'), '04Zz9ED0CU8', 'Center - Day 15 - Reset', 21, 15, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'center-30-day'), '4yxB911xoUE', 'Center - Day 16 - Kind', 19, 16, '{}'::text[], 17),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'Bqdqu1GRBmQ', 'Center - Day 17 - Move', 22, 17, '{}'::text[], 18),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'OeTbwCuzLtM', 'Center - Day 18 - Gaze', 20, 18, '{}'::text[], 19),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'obtulrEW2P0', 'Center - Day 19 - Play', 20, 19, '{}'::text[], 20),
  ((select id from yoga_playlists where slug = 'center-30-day'), '8FsuEH8iFdw', 'Center - Day 20 - Restore', 17, 20, '{}'::text[], 21),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'OOAEgEPX2xQ', 'Center - Day 21 - Strength', 18, 21, '{}'::text[], 22),
  ((select id from yoga_playlists where slug = 'center-30-day'), '7jVw5j4R-B4', 'Center - Day 22 - Align', 27, 22, '{}'::text[], 23),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'A_kFHdcACcM', 'Center - Day 23 - Soar', 18, 23, '{}'::text[], 24),
  ((select id from yoga_playlists where slug = 'center-30-day'), '2oINpxBVKAk', 'Center - Day 24 - Explore', 22, 24, '{}'::text[], 25),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'MqaxmZFGmAI', 'Center - Day 25 - Amor', 24, 25, '{}'::text[], 26),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'wQKJdUKDmfw', 'Center - Day 26 - Connect', 24, 26, '{}'::text[], 27),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'aHJIkMW8LOo', 'Center - Day 27 - Yin', 22, 27, '{}'::text[], 28),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'iTe2PLBCBEQ', 'Center - Day 28 - Freedom', 21, 28, '{}'::text[], 29),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'RooOlcSy1nI', 'Center - Day 29 - Pleasure', 25, 29, '{}'::text[], 30),
  ((select id from yoga_playlists where slug = 'center-30-day'), 'Tp0J0k-aLoI', 'Center - Day 30 - Return', 24, 30, '{}'::text[], 31)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('flow-30-day', 'FLOW - A 30 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzwwBB_riVPMdOF3cmheEPpy', 'Thirty days of flowing sequences. The most demanding of the journeys.', 'intermediate'::fitness_level, true, 5)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'flow-30-day'), '0et6I930LaU', 'Flow - 30 Days of Yoga 2024 - Announcement', 3, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '2HKBOfEX7HA', 'Flow - Day 0 - Ready', 6, 0, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'Qbnpbqd-jhQ', 'Flow - Day 1 - Set', 25, 1, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '4rZAQ2LfDAs', 'Flow - Day 2 - Notice', 22, 2, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'SZF7Jp6SyPI', 'Flow - Day 3 - How', 21, 3, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'IM1_XI56boY', 'Flow - Day 4 - Movement', 21, 4, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'GFY356-1K-Q', 'Flow - Day 5 - Represent', 19, 5, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'MAASAP7qXCQ', 'Flow - Day 6 - Center', 19, 6, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'mACIBRUH5TU', 'Flow - Day 7 - Sync', 23, 7, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '9jZfPYL6ufU', 'Flow - Day 8 - Relax', 20, 8, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '2GVysgcBo_U', 'Flow - Day 9 - Release', 23, 9, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'IOwKfP2LWxk', 'Flow - Day 10 - Align', 24, 10, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'MaN7TOFv_RQ', 'Flow - Day 11 - Soul', 17, 11, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'w2Ynv-m0gzI', 'Flow - Day 12 - Stability', 20, 12, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'RnB4fHR5GEQ', 'Flow - Day 13 - Ease', 18, 13, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'Gya78kL0_rY', 'Flow - Day 14 - Welcome', 26, 14, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'wdIQZGx9ukw', 'Flow - Day 15 - Balance', 23, 15, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'G0ndIdcZfyA', 'Flow - Day 16 - Kindness', 20, 16, '{}'::text[], 17),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'UDAqG15Cl-A', 'Flow - Day 17 - Rinse', 24, 17, '{}'::text[], 18),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'lYr253FBnLk', 'Flow - Day 18 - Meditate', 10, 18, '{}'::text[], 19),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '9Od_S1P0c40', 'Flow - Day 19 - Ride', 23, 19, '{}'::text[], 20),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'w7GSmtiDUJ4', 'Flow - Day 20 - Inward', 20, 20, '{}'::text[], 21),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'Bm55SUjewM0', 'Flow - Day 21 - Curious', 21, 21, '{}'::text[], 22),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '-ECIZdaPcQE', 'Flow - Day 22 - Truth', 20, 22, '{}'::text[], 23),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '5e_FFdHqnKM', 'Flow - Day 23 - Root', 23, 23, '{}'::text[], 24),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '49M4lpWZspo', 'Flow - Day 24 - Create', 19, 24, '{}'::text[], 25),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'cJSCkiVlDPE', 'Flow - Day 25 - Action', 24, 25, '{}'::text[], 26),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'HSu97STh1eY', 'Flow - Day 26 - Open', 24, 26, '{}'::text[], 27),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '2AF__AJRNSE', 'Flow - Day 27 - Speak', 20, 27, '{}'::text[], 28),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '_DsK4Fgf2x8', 'Flow - Day 28 - Intuit', 23, 28, '{}'::text[], 29),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'tOyxaZMBP7M', 'Flow - Day 29 - Trust', 26, 29, '{}'::text[], 30),
  ((select id from yoga_playlists where slug = 'flow-30-day'), 'y1-mbo1nbUM', 'Flow - Day 30 - Flow', 26, 30, '{}'::text[], 31),
  ((select id from yoga_playlists where slug = 'flow-30-day'), '7KzRILY6WCM', 'Flow - Day 31 - Epilogue', 3, 31, '{}'::text[], 32)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('prana-7-day', 'Prana - A 7 Day Yoga Journey', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzzWot7-fuGgm92N3EYlJkiD', 'A seven-day journey. Good for a single yoga week.', 'beginner'::fitness_level, true, 6)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'DVVxQk2ToxQ', 'Prana - Day 8 Bonus!', 10, 8, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'EtJPA0dVTDs', 'Prana - Day 7', 24, 7, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'gALB0Vj93YQ', 'Prana - Day 6', 17, 6, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'p0KSFLf_XJA', 'Prana - Day 5', 19, 5, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'pt7AFyWtPGE', 'Prana - Day 4', 23, 4, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'n1r7axbdH70', 'Prana - Day 3', 18, 3, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'gZ1DtlOJNMI', 'Prana - Day 2', 23, 2, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'tC-aST6A194', 'Prana - Day 1', 27, 1, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'PYDacIoSeRI', 'Prana - A 7 Day Yoga Journey', 2, null, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'prana-7-day'), 'r9257EJwM4M', 'Prana -7 Day Yoga Series Intro Video!', 2, null, '{}'::text[], 9)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('yoga-for-mobility', 'Yoga for Mobility', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzyQxrCXkO2-Ap_ku_CxPs-5', 'Short practices for stiff hips, shoulders and spine.', 'beginner'::fitness_level, false, 7)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'yoga-for-mobility'), '2IcWJobNDck', 'Morning Mobility Yoga | Wake Up and Stretch!', 22, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'yoga-for-mobility'), 'zeWO_635loM', 'Lower Back Mobility', 12, null, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'yoga-for-mobility'), 'mgpjd4JMSZg', 'Upper Back and Neck Mobility | 13-Minute Yoga Practice', 13, null, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'yoga-for-mobility'), 'pWNv6oE-5RI', 'Shoulder and Wrist Mobility', 11, null, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'yoga-for-mobility'), 'GffXQl3zvUI', 'Hip Mobility - Open Your Hips  - 13 Min Yoga Practice', 13, null, '{}'::text[], 4)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('restorative-yoga', 'Restorative Yoga', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzxghGvVE7V_6YsZ7rh5r1Fx', 'Slow, supported practices. Ideal the day after heavy legs.', 'beginner'::fitness_level, false, 8)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'RQyX48NtDrQ', 'Intro to Yin - Yin Yoga', 26, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'iglbdN1tmF0', 'Yoga For Women |  Yoga With Adriene', 34, null, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'WtGE0Uz9zSE', 'Yoga For Relaxation', 34, null, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), '_FIvJdwePiM', 'Cozy Yoga  |  Yoga With Adriene', 38, null, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'wwPzwZo6vdk', 'Gift of Relaxation | 33-Minute Feel Good Yoga', 33, null, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'n5YvtYXSocw', 'Yoga For When You Are SICK - Yoga With Adriene', 20, null, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'qmI_ygVOoLU', 'TRUE - Day 8 - SALVE  |  Yoga With Adriene', 30, null, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'xLS9uQQQyB0', '6-Minute Yoga Chill | Relaxing Yoga | Yoga With Adriene', 6, null, '{}'::text[], 7),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'v7SN-d4qXx0', 'Bedtime Yoga | 20 Minute Bedtime Yoga Practice | Yoga With Adriene', 19, null, '{}'::text[], 8),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'XOTGz-1vizY', 'Bedtime Yoga Sequence', 37, null, '{}'::text[], 9),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'BiWDsfZ3zbo', 'Wind Down Yoga   |  12-Minute Bedtime Yoga', 12, null, '{}'::text[], 10),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'HtSSMx-LbQ4', 'Yoga To Slow Your Roll  |  16-Minute Home Yoga', 16, null, '{}'::text[], 11),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'tD_l3fDTFyg', 'Yoga To Heal Stress  |  20-Minute Yoga Practice', 21, null, '{}'::text[], 12),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'ABcqXvx5Ffg', 'Blanket Yoga  |  Full Yoga Relaxation Practice', 40, null, '{}'::text[], 13),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'u1qayo-0aL4', 'Morning Hip Release | 15 Minute Yoga Practice', 15, null, '{}'::text[], 14),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'KrUnq66qn_k', 'Yoga Stretch For Recovery Days | 12 Minute Yoga Practice', 12, null, '{}'::text[], 15),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'lxuTCHJSers', 'Full Body Stretch - 10 Minute Workout', 12, null, '{}'::text[], 16),
  ((select id from yoga_playlists where slug = 'restorative-yoga'), 'JQ3Cr20Osbo', 'Yoga For Tired Feet - 14 Minute Yoga Practice', 14, null, '{}'::text[], 17)
on conflict do nothing;

insert into yoga_playlists (slug, title, creator, channel_url, youtube_playlist_id, description, level, is_series, sort_order) values
  ('yoga-neck-tension', 'Yoga for Neck Tension', 'Yoga with Adriene', 'https://www.youtube.com/@yogawithadriene', 'PLui6Eyny-UzxlIwoqK-RPwYKD-gMuteVT', 'Short practices for a neck that has had enough of a desk.', 'beginner'::fitness_level, false, 9)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  youtube_playlist_id = excluded.youtube_playlist_id,
  level = excluded.level, is_series = excluded.is_series,
  sort_order = excluded.sort_order;

insert into yoga_videos (playlist_id, youtube_video_id, title, duration_minutes, day_index, focus_areas, sort_order) values
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'X3-gKPNyrTA', 'Yoga For Neck, Shoulders, Upper Back  |  10-Minute Yoga Quickie', 11, null, '{}'::text[], 0),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'SedzswEwpPw', 'Yoga for Neck and Shoulder Relief - Yoga With Adriene', 18, null, '{}'::text[], 1),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'JUP_YdYyfQw', 'Yoga For Text Neck  |  Yoga With Adriene', 29, null, '{}'::text[], 2),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'b6wPHhWiqgc', 'Yoga For Daily Neck Relief', 4, null, '{}'::text[], 3),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'we0q2hojlxg', 'Yoga For Headaches', 31, null, '{}'::text[], 4),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'QFkAl5wHEbg', 'Yoga For Migraines - Yoga With Adriene', 24, null, '{}'::text[], 5),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'DQew7AiwPWw', 'Yoga For Acid Reflux - Embrace It! - Yoga With Adriene', 13, null, '{}'::text[], 6),
  ((select id from yoga_playlists where slug = 'yoga-neck-tension'), 'OHTcr7F1QiY', 'Yoga on an Airplane | Travel Yoga | Yoga with Adriene', 4, null, '{}'::text[], 7)
on conflict do nothing;

