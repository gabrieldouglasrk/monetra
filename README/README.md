# Site Financeiro com Login Google

Site estatico para publicar no GitHub Pages, com login Google via Firebase Authentication e dados salvos por usuario no Firestore.

## Como configurar

1. Crie um projeto no Firebase.
2. Ative Authentication > Google.
3. Crie um banco Firestore.
4. Em Project settings > Web app, copie o `firebaseConfig`.
5. Cole os valores em `app.js`.
6. Em Authentication > Settings > Authorized domains, adicione:
   - `localhost`
   - seu dominio do GitHub Pages, como `seuusuario.github.io`

## Regras sugeridas do Firestore

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Publicar no GitHub

Suba esta pasta para um repositorio e ative GitHub Pages apontando para a branch principal.
