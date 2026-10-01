# Keycloak Setup Guide

## Prerequisites

You need a running Keycloak server. Choose one of these options:

### Option 1: Docker (Recommended for Development)

```bash
docker run -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

Access Keycloak Admin Console at: http://localhost:8080
- Username: `admin`
- Password: `admin`

### Option 2: Standalone Installation

Download from: https://www.keycloak.org/downloads

## Keycloak Configuration

### 1. Create Realm

1. Login to Keycloak Admin Console
2. Click **Create Realm**
3. Name: `calendar-app`
4. Click **Create**

### 2. Create Client

1. In `calendar-app` realm, go to **Clients** → **Create client**
2. **General Settings**:
   - Client type: `OpenID Connect`
   - Client ID: `wely-client`
3. **Capability config**:
   - Client authentication: `OFF` (public client)
   - Authorization: `OFF`
   - Standard flow: `ON`
   - Direct access grants: `ON`
4. **Login settings**:
   - Valid redirect URIs: `http://localhost:4200/*`
   - Valid post logout redirect URIs: `http://localhost:4200/*`
   - Web origins: `http://localhost:4200`
5. Click **Save**

### 3. Create Test User

1. Go to **Users** → **Add user**
2. Username: `testuser`
3. Email: `test@example.com`
4. First name: `Test`
5. Last name: `User`
6. Email verified: `ON`
7. Click **Create**
8. Go to **Credentials** tab
9. Click **Set password**
10. Password: `password`
11. Temporary: `OFF`
12. Click **Save**

### 4. Enable User Registration

1. Go to **Realm Settings** → **Login** tab
2. Enable the following options:
   - ✅ **User registration** - Allows new users to sign up
   - ✅ **Forgot password** - Enables password reset
   - ✅ **Remember me** - Allows users to stay logged in
   - ✅ **Login with email** - Allows login with email instead of username
3. Click **Save**

#### Optional: Email Verification (Recommended for Production)

To require email verification for new users:

1. In **Realm Settings** → **Login**:
   - ✅ **Verify email** - Forces email verification
2. Go to **Realm Settings** → **Email** tab
3. Configure SMTP settings:
   - **Host**: Your SMTP server (e.g., `smtp.gmail.com`)
   - **Port**: Usually `587` for TLS
   - **From**: Email address for sending (e.g., `noreply@yourdomain.com`)
   - **From Display Name**: `Calendar App`
   - **Enable SSL**: OFF
   - **Enable StartTLS**: ON
   - **Enable Authentication**: ON
   - **Username**: Your SMTP username
   - **Password**: Your SMTP password
4. Click **Save**
5. Test the configuration by clicking **Test connection**

> **Note**: For development, you can skip email verification. For production, it's highly recommended to enable it.

### 5. Install Custom Theme

```bash
# Copy theme to Keycloak
docker cp keycloak-theme/calendar-app <container-name>:/opt/keycloak/themes/

# Or for standalone installation
cp -r keycloak-theme/calendar-app /path/to/keycloak/themes/
```

Then in Keycloak Admin Console:
1. **Realm Settings** → **Themes**
2. Login Theme: `calendar-app`
3. Click **Save**

## Testing the Integration

### 1. Start the App

```bash
npm run start
```

### 2. Test Login Flow

1. Navigate to http://localhost:4200
2. Click **"Login"** button in navbar
3. You should be redirected to Keycloak login with custom theme
4. Login with:
   - Username: `testuser`
   - Password: `password`
5. You should be redirected back to `/calendar`
6. Check sidebar - your name should appear
7. Click **Logout** - you should return to landing page

### 3. Test Sign Up Flow

1. Navigate to http://localhost:4200
2. Click **"Sign Up"** button in navbar or **"Get Started Free"** button
3. You should be redirected to Keycloak registration page with custom theme
4. Fill in the registration form:
   - Username: Choose a unique username
   - Password: Choose a secure password
   - Confirm password: Re-enter your password
   - Email: Enter a valid email
   - First name: Your first name
   - Last name: Your last name
5. Click **Register**
6. You should be automatically logged in and redirected to `/calendar`
7. Your name should appear in the sidebar

## Troubleshooting

### "Failed to initialize adapter"
- Check Keycloak server is running on http://localhost:8080
- Verify realm name is `calendar-app`
- Verify client ID is `wely-client`

### "Invalid redirect URI"
- Check client settings in Keycloak
- Ensure `http://localhost:4200/*` is in Valid redirect URIs

### Theme not showing
- Verify theme folder is copied to Keycloak themes directory
- Check Keycloak logs for theme errors
- Clear browser cache
- Restart Keycloak server

### User profile not showing
- Check browser console for errors
- Verify user has firstName and lastName in Keycloak

## Production Configuration

For production, update `keycloak-init.factory.ts`:

```typescript
config: {
  url: 'https://your-keycloak-domain.com',
  realm: 'wely-realm',
  clientId: 'wely-client'
}
```

Also update client settings in Keycloak with production URLs.
