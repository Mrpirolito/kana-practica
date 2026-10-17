-- Friends leaderboard: exposes only totals computed from each user's private progress.
-- Mastered kana = 20+ attempts at 90%+ accuracy (same rule as the Mixed course).
create or replace function public.leaderboard()
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  name_color text,
  name_color2 text,
  name_effect text,
  mastered_kana int,
  total_correct int,
  accuracy numeric,
  days_trained int,
  words_read int
)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select
      p.user_id,
      coalesce(((p.data ->> 'kanadojo-stats')::jsonb) -> 'state' -> 'allTimeStats', '{}'::jsonb) as s,
      coalesce(((p.data ->> 'kana-course')::jsonb) -> 'state' -> 'wordsCorrect', '{}'::jsonb) as w
    from public.user_progress p
  ),
  kana as (
    select st.user_id,
      count(*) filter (
        where (m.value ->> 'correct')::int + (m.value ->> 'incorrect')::int >= 20
          and (m.value ->> 'correct')::numeric
            / nullif((m.value ->> 'correct')::int + (m.value ->> 'incorrect')::int, 0) >= 0.9
      )::int as mastered,
      coalesce(sum((m.value ->> 'correct')::int), 0)::int as correct,
      coalesce(sum((m.value ->> 'incorrect')::int), 0)::int as incorrect
    from stats st
    left join lateral jsonb_each(coalesce(st.s -> 'characterMastery', '{}'::jsonb)) m on true
    group by st.user_id
  )
  select
    st.user_id,
    coalesce(pr.username, 'Sin nombre'),
    pr.avatar_url,
    coalesce(pr.name_color, '#ff6b8a'),
    coalesce(pr.name_color2, '#a78bfa'),
    coalesce(pr.name_effect, 'none'),
    k.mastered,
    k.correct,
    round(100.0 * k.correct / nullif(k.correct + k.incorrect, 0), 1),
    coalesce(jsonb_array_length(st.s -> 'trainingDays'), 0),
    coalesce((st.w ->> 'hiragana')::int, 0) + coalesce((st.w ->> 'katakana')::int, 0)
  from stats st
  join kana k using (user_id)
  left join public.profiles pr on pr.id = st.user_id
  where auth.uid() is not null
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;
