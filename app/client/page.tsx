import ClientWall from "./wall";

// The client's front door (Stage 5): their wall, built from their switches. The middleware lets only an approved client
// reach this; the wall backend's scoped answers are all it draws from.
export const metadata = { title: "Your flights" };

export default function ClientHome() {
  return <ClientWall />;
}
