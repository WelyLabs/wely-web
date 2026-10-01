# Configuration OAuth Social Login - Keycloak

Ce guide explique comment ajouter l'authentification Google et Apple (Sign in with Apple) dans Keycloak.

---

## 🔵 Google OAuth Configuration

### Étape 1 : Créer un projet Google Cloud

1. **Accéder à Google Cloud Console**
   - Allez sur : https://console.cloud.google.com
   - Connectez-vous avec votre compte Google

2. **Créer un nouveau projet**
   - Cliquez sur le sélecteur de projet en haut
   - Cliquez sur **"New Project"**
   - Nom : `Calendar App`
   - Cliquez sur **"Create"**

### Étape 2 : Configurer l'écran de consentement OAuth

1. **Menu** → **APIs & Services** → **OAuth consent screen**
2. **User Type** : Sélectionnez **"External"**
3. **App information** :
   - App name : `Calendar App`
   - User support email : votre email
   - Developer contact : votre email
4. **Scopes** : Cliquez **"Save and Continue"** (pas besoin d'ajouter de scopes)
5. **Test users** : Ajoutez votre email pour les tests
6. Cliquez **"Save and Continue"** puis **"Back to Dashboard"**

### Étape 3 : Créer les credentials OAuth

1. **Menu** → **APIs & Services** → **Credentials**
2. Cliquez **"Create Credentials"** → **"OAuth client ID"**
3. **Application type** : `Web application`
4. **Name** : `Calendar App Client`
5. **Authorized redirect URIs** :
   ```
   http://localhost:8080/realms/wely-realm/broker/google/endpoint
   ```
   > ⚠️ Remplacez `localhost:8080` par votre URL Keycloak en production

6. Cliquez **"Create"**
7. **Notez** :
   - Client ID : `xxxxx.apps.googleusercontent.com`
   - Client Secret : `xxxxxxx`

### Étape 4 : Configurer Google dans Keycloak

1. **Keycloak Admin Console** → Realm `calendar-app`
2. **Identity Providers** → **Add provider** → **Google**
3. **Configuration** :
   - **Alias** : `google` (ne pas changer)
   - **Display name** : `Google`
   - **Client ID** : Collez le Client ID de Google
   - **Client Secret** : Collez le Client Secret de Google
   - **Default Scopes** : `openid profile email`
4. Cliquez **"Save"**

---

## 🍎 Apple Sign In Configuration

### Étape 1 : Créer un App ID Apple

1. **Accéder à Apple Developer**
   - Allez sur : https://developer.apple.com/account
   - Connectez-vous avec votre Apple ID
   - **Note** : Nécessite un compte Apple Developer (99$/an)

2. **Créer un App ID**
   - **Certificates, Identifiers & Profiles** → **Identifiers**
   - Cliquez **"+"** pour créer un nouvel identifier
   - Sélectionnez **"App IDs"** → **Continue**
   - **Description** : `Calendar App`
   - **Bundle ID** : `com.yourcompany.calendarapp` (choisissez votre propre)
   - **Capabilities** : Cochez **"Sign in with Apple"**
   - Cliquez **"Continue"** puis **"Register"**

### Étape 2 : Créer un Service ID

1. **Identifiers** → Cliquez **"+"**
2. Sélectionnez **"Services IDs"** → **Continue**
3. **Description** : `Calendar App Web`
4. **Identifier** : `com.yourcompany.calendarapp.web`
5. Cochez **"Sign in with Apple"**
6. Cliquez **"Configure"** à côté de "Sign in with Apple"
7. **Primary App ID** : Sélectionnez l'App ID créé précédemment
8. **Domains and Subdomains** :
   ```
   localhost
   ```
   > En production, ajoutez votre domaine réel
9. **Return URLs** :
   ```
   http://localhost:8080/realms/wely-realm/broker/apple/endpoint
   ```
10. Cliquez **"Save"** puis **"Continue"** puis **"Register"**

### Étape 3 : Créer une clé privée

1. **Keys** → Cliquez **"+"**
2. **Key Name** : `Calendar App Sign in with Apple Key`
3. Cochez **"Sign in with Apple"**
4. Cliquez **"Configure"** → Sélectionnez votre App ID
5. Cliquez **"Save"** puis **"Continue"** puis **"Register"**
6. **Téléchargez** le fichier `.p8` (vous ne pourrez le télécharger qu'une seule fois !)
7. **Notez** :
   - Key ID : `XXXXXXXXXX` (affiché après création)
   - Team ID : Trouvé en haut à droite de la page (à côté de votre nom)

### Étape 4 : Configurer Apple dans Keycloak

1. **Keycloak Admin Console** → Realm `calendar-app`
2. **Identity Providers** → **Add provider** → **Apple**
3. **Configuration** :
   - **Alias** : `apple` (ne pas changer)
   - **Display name** : `Apple`
   - **Services ID** : `com.yourcompany.calendarapp.web`
   - **Team ID** : Votre Team ID Apple
   - **Key ID** : Le Key ID de votre clé `.p8`
   - **Private Key** : Ouvrez le fichier `.p8` et collez tout le contenu
   - **Default Scopes** : `name email`
4. Cliquez **"Save"**

---

## 🎨 Personnaliser l'affichage des boutons

### Ajouter des icônes aux boutons sociaux

Modifiez le thème Keycloak pour ajouter des icônes :

**keycloak-theme/calendar-app/login/resources/css/login.css**

Ajoutez à la fin du fichier :

```css
/* Social Login Buttons */
#kc-social-providers {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e2e8f0;
}

#kc-social-providers .kc-social-section-header {
  text-align: center;
  color: #64748b;
  font-size: 14px;
  margin-bottom: 16px;
}

#kc-social-providers ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Google Button */
.zocial.google,
a[href*="google"] {
  background: white !important;
  color: #1f2937 !important;
  border: 2px solid #e5e7eb !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.zocial.google:hover,
a[href*="google"]:hover {
  background: #f9fafb !important;
  border-color: #d1d5db !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.zocial.google::before,
a[href*="google"]::before {
  content: "";
  width: 20px;
  height: 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%234285F4' d='M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z'/%3E%3Cpath fill='%2334A853' d='M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z'/%3E%3Cpath fill='%23FBBC05' d='M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z'/%3E%3Cpath fill='%23EA4335' d='M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
}

/* Apple Button */
.zocial.apple,
a[href*="apple"] {
  background: #000000 !important;
  color: white !important;
  border: 2px solid #000000 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.zocial.apple:hover,
a[href*="apple"]:hover {
  background: #1f1f1f !important;
  border-color: #1f1f1f !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.zocial.apple::before,
a[href*="apple"]::before {
  content: "";
  width: 20px;
  height: 20px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
}

/* Responsive */
@media (max-width: 768px) {
  #kc-social-providers ul {
    gap: 8px;
  }
}
```

Puis redémarrez Keycloak ou rechargez le thème.

---

## 🧪 Test de l'authentification sociale

### 1. Tester Google

1. Accédez à votre app : http://localhost:4200
2. Cliquez sur **"Get Started Free"**
3. Sur la page de login Keycloak, cliquez sur **"Google"**
4. Connectez-vous avec votre compte Google
5. Vous devriez être redirigé vers `/calendar`

### 2. Tester Apple

1. Même processus, mais cliquez sur **"Apple"**
2. Connectez-vous avec votre Apple ID
3. Vous devriez être redirigé vers `/calendar`

---

## 🔧 Troubleshooting

### Google : "redirect_uri_mismatch"
- Vérifiez que l'URL de redirection dans Google Cloud Console correspond exactement
- Format : `http://localhost:8080/realms/wely-realm/broker/google/endpoint`

### Apple : "invalid_client"
- Vérifiez le Service ID
- Vérifiez que le fichier `.p8` est correctement collé
- Vérifiez le Team ID et Key ID

### Boutons sociaux n'apparaissent pas
- Vérifiez que les Identity Providers sont activés dans Keycloak
- Videz le cache du navigateur
- Redémarrez Keycloak

### Utilisateur créé mais pas de données
- Dans Keycloak, allez dans **Identity Providers** → **Google/Apple**
- Activez **"Trust Email"** et **"Store Tokens"**
- Configurez les **Mappers** pour importer les données utilisateur

---

## 📝 Production Checklist

Avant de déployer en production :

- [ ] Mettre à jour les redirect URIs avec le domaine de production
- [ ] Configurer HTTPS (obligatoire pour Apple)
- [ ] Vérifier les scopes demandés
- [ ] Tester le flow complet
- [ ] Configurer les mappers Keycloak pour les attributs utilisateur
- [ ] Mettre l'app Google en production (retirer du mode test)
- [ ] Vérifier la politique de confidentialité (requise par Google et Apple)
