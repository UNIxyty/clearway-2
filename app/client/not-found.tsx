// What a client gets for any address outside their world, and what staff get under /client (Stage 5). One sentence; the
// same words the wall backend uses for a flight that is not theirs. The segment's not-found: the middleware rewrites to
// /client/gone, whose page calls notFound(), so the status is a real 404 and the body is this, under the client layout
// (never the portal's root not-found, whose payload carries the docs).
export default function ClientNotFound() {
  return (
    <main className="cl-hold" data-client-notfound="">
      <h1>That is not on your account.</h1>
      <p>If you reached this from a link, the flight or page is not one your account covers.</p>
      <div className="cl-actions"><a className="cl-btn" href="/client">Your flights</a></div>
    </main>
  );
}
