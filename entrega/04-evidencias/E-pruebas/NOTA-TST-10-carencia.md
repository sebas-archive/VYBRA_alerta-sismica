# TST-10 — Carencia estructural documentada

El repositorio **no dispone** de:

- medición de **cobertura** de pruebas (C++ ni JavaScript);
- compilación con **AddressSanitizer / UndefinedBehaviorSanitizer**;
- **integración continua** (no hay `.github/workflows`, `.gitlab-ci.yml`, `Jenkinsfile`, etc.);
- umbrales de cobertura ni informes tipo lcov/c8.

La evidencia de la comprobación (búsqueda de archivos y flags, fecha y comandos) está en
`log-TST-10-carencia.txt`. Las pruebas existentes son funcionales: arnés C++ propio con red Raft
simulada (`log-TST-01-cpp.txt`) y `node:test` en JavaScript (`log-TST-03-js.txt`), además de
`test:db` y `test:infra`. Esta carencia se declara como limitación, no se simula una cobertura.
