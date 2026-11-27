// GET /api/programs?q=搜索词
import { ok } from '../../_lib/http.js';
import { searchPrograms } from '../../_lib/programs.js';

export async function onRequestGet({ request }) {
  const query = new URL(request.url).searchParams.get('q') || '';
  return ok({ programs: searchPrograms(query) }, 200, { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" });
}
