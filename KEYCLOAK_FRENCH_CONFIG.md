# Configuration de Keycloak en Français

## ✅ Configuration côté Angular (Déjà fait)

### 1. Détection automatique de la langue

J'ai ajouté une fonction `getBrowserLocale()` dans le fichier [`keycloak-init.factory.ts`](file:///Users/theobanette/Desktop/projects/calendar-app/src/app/core/auth/keycloak-init.factory.ts) qui :

- **Détecte automatiquement** la langue du navigateur de l'utilisateur
- **Extrait le code de langue** (ex: `fr-FR` → `fr`, `en-US` → `en`)
- **Utilise le français par défaut** si la langue du navigateur n'est pas supportée

### 2. Masquage du sélecteur de langue

J'ai également ajouté du CSS dans votre thème personnalisé [`login.css`](file:///Users/theobanette/Desktop/projects/calendar-app/keycloak-theme/calendar-app/login/resources/css/login.css) pour masquer le sélecteur de langue, car la langue est maintenant détectée automatiquement.

## 🔧 Configuration côté Serveur Keycloak

Pour que les formulaires Keycloak s'affichent en français, vous devez également configurer votre serveur Keycloak :

### 1. Activer la localisation dans Keycloak

1. Connectez-vous à la console d'administration Keycloak : `http://localhost:8080/admin`
2. Sélectionnez votre realm **calendar-app**
3. Allez dans **Realm Settings** (Paramètres du Realm)
4. Cliquez sur l'onglet **Localization** (Localisation)
5. Activez **Internationalization Enabled** (Internationalisation activée)
6. Dans **Supported Locales** (Langues supportées), ajoutez **fr** (français)
7. Définissez **Default Locale** à **fr** pour que le français soit la langue par défaut
8. Cliquez sur **Save** (Enregistrer)

### 2. Vérifier les traductions françaises

Keycloak inclut par défaut les traductions françaises pour tous les formulaires standards :
- Formulaire de connexion
- Formulaire d'inscription
- Formulaire de réinitialisation de mot de passe
- Messages d'erreur
- Etc.

### 3. Personnaliser les traductions (Optionnel)

Si vous souhaitez personnaliser certaines traductions :

1. Dans la console d'administration, allez dans **Realm Settings** > **Localization**
2. Sélectionnez la langue **fr** dans le menu déroulant
3. Cliquez sur **Create** pour ajouter une nouvelle traduction personnalisée
4. Entrez la clé de traduction et sa valeur personnalisée

### 4. Vérifier avec votre thème personnalisé

Si vous utilisez un thème personnalisé (comme mentionné dans le dossier `keycloak-theme/`), assurez-vous que :

1. Votre thème ne surcharge pas les fichiers de traduction
2. Les fichiers de messages français sont présents dans votre thème si vous les avez personnalisés

## 🧪 Test de la configuration

1. Déconnectez-vous de votre application si vous êtes connecté
2. Effacez le cache de votre navigateur ou utilisez une fenêtre de navigation privée
3. Accédez à votre application : `http://localhost:4200`
4. Cliquez sur "Se connecter" ou "S'inscrire"
5. Les formulaires Keycloak devraient maintenant s'afficher en français

## 📝 Éléments traduits en français

Une fois configuré, vous verrez en français :
- **Connexion** au lieu de "Sign In"
- **Nom d'utilisateur ou e-mail** au lieu de "Username or email"
- **Mot de passe** au lieu de "Password"
- **Se souvenir de moi** au lieu de "Remember me"
- **Mot de passe oublié ?** au lieu de "Forgot Password?"
- **S'inscrire** au lieu de "Register"
- Tous les messages d'erreur et de validation

## 🔍 Dépannage

### Les formulaires sont toujours en anglais ?

1. Vérifiez que **Internationalization** est bien activé dans les paramètres du realm
2. Vérifiez que **fr** est dans la liste des **Supported Locales**
3. Effacez le cache de votre navigateur
4. Vérifiez dans les outils de développement du navigateur (Network tab) que le paramètre `kc_locale=fr` est bien passé dans l'URL de redirection Keycloak

### Certains textes restent en anglais ?

Si vous utilisez un thème personnalisé, certains textes peuvent ne pas être traduits. Dans ce cas :
1. Vérifiez les fichiers de messages dans votre thème
2. Ajoutez un fichier `messages_fr.properties` dans votre thème si nécessaire

## 📚 Ressources

- [Documentation Keycloak sur la localisation](https://www.keycloak.org/docs/latest/server_development/#_locale-selector)
- [Fichiers de traduction Keycloak sur GitHub](https://github.com/keycloak/keycloak/tree/main/themes/src/main/resources/theme/base/login/messages)
