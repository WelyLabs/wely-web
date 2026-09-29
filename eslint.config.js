// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', '.angular/**', 'node_modules/**', 'keycloak-theme/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // --- Ce que l'audit demande d'éradiquer -------------------------------
      // Les logs applicatifs passent par LoggerService, muet en production.
      // Un console.log restant a journalisé le contenu de messages privés.
      'no-console': 'error',
      // La couche RSocket était entièrement typée any, parce que rsocket.d.ts
      // déclarait les modules sans types. Les interfaces sont maintenant écrites.
      '@typescript-eslint/no-explicit-any': 'error',

      // --- Hygiène ----------------------------------------------------------
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-private-class-members': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',

      // --- Conventions Angular ---------------------------------------------
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // Les souscriptions non fermées dans ngOnInit étaient une fuite mémoire à
      // chaque navigation ; takeUntilDestroyed ou le pipe async sont la réponse.
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/no-empty-lifecycle-method': 'error',
      '@angular-eslint/prefer-standalone': 'error',
    },
  },
  {
    // Les tests peuvent nommer des doubles librement et s'appuyer sur des casts.
    files: ['**/*.spec.ts', 'src/test-setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);
