// Script para crear usuario de prueba con contraseña válida
const http = require('http');

function makeRequest(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function createTestUser() {
  console.log('👤 Creando usuario de prueba...\n');

  // Contraseña que cumple con todos los requisitos:
  // - 12+ caracteres
  // - Mayúsculas y minúsculas
  // - Números
  // - Caracteres especiales
  const strongPassword = 'TestPassword2024!@#$';

  try {
    const response = await makeRequest('/api/v1/auth/register', 'POST', {
      name: 'Usuario Prueba Seguridad',
      email: 'test@transport-pro.com',
      password: strongPassword,
      taxId: '12345678-9',
      tenantSlug: 'demo'
    });

    console.log(`Status: ${response.statusCode}`);
    console.log(`Body: ${response.body}`);

    if (response.statusCode === 201) {
      console.log('\n✅ Usuario creado exitosamente!');
      console.log('📧 Email: test@transport-pro.com');
      console.log('🔑 Password: TestPassword2024!@#$');
    } else {
      console.log('\n❌ Error al crear usuario');
      console.log('🔍 Intentando con tenant existente...');
      
      // Intentar sin tenantSlug (dejar que el sistema lo resuelva)
      const response2 = await makeRequest('/api/v1/auth/register', 'POST', {
        name: 'Usuario Prueba Seguridad',
        email: 'test2@transport-pro.com',
        password: strongPassword,
        taxId: '98765432-1'
      });

      console.log(`\nSegundo intento - Status: ${response2.statusCode}`);
      console.log(`Body: ${response2.body}`);

      if (response2.statusCode === 201) {
        console.log('\n✅ Usuario creado exitosamente!');
        console.log('📧 Email: test2@transport-pro.com');
        console.log('🔑 Password: TestPassword2024!@#$');
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n🔐 Credenciales para pruebas:');
  console.log(JSON.stringify({
    email: 'test@transport-pro.com',
    password: 'TestPassword2024!@#$'
  }, null, 2));
}

createTestUser();
