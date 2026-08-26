export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const firebaseOptions = {
  enabled: true,
  tournamentId: "main",
  archivedTournaments: [
    // Past tournaments shown read-only in the History tab, e.g.
    // { id: "main", name: "June 2026 · Israel" }
  ]
};
