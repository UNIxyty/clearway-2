// Every row of a query, a page at a time (2026-11-07). The database answers at most 1000 rows a read (max_rows), even
// to .limit(10000), and says nothing: a list cut there is a wrong list, not a partial one. `page(from, to)` builds the
// query afresh for each range, with a stable order. Past `max` it returns an error instead of a quiet cut.
type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>, { size = 1000, max = 200_000 } = {}): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < size) return { data: rows, error: null };
    if (rows.length >= max) return { data: null, error: { message: `more than ${max} rows: refusing a partial list` } };
  }
}
