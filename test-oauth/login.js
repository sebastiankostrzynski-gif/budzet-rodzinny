// Smoke test for the web OAuth client, independent of the spreadsheet.
const clientId = '346154367588-kd2si4cjh6hgelh9jhujbiph73e67l5m.apps.googleusercontent.com';
export async function initializeLogin() {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Nie udało się wczytać logowania Google.'));
    document.head.append(script);
  });
  const oauth = window.google.accounts.oauth2;
  return () => new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: 'openid email',
      include_granted_scopes: false,
      error_callback: () => reject(new Error('Nie ukończono logowania. Spróbuj ponownie.')),
      callback: async (response) => {
        if (response.error || !response.access_token) {
          reject(new Error('Google nie potwierdził logowania.'));
          return;
        }
        try {
          const result = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: 'Bearer ' + response.access_token },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error'
          });
          if (!result.ok) throw new Error('Google nie zwrócił danych konta.');
          const profile = await result.json();
          if (profile.email_verified !== true || !profile.email) {
            throw new Error('Brak potwierdzonego adresu konta Google.');
          }
          resolve({ email: profile.email });
        } catch (error) {
          reject(error);
        }
      }
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}
