// Script para probar los usuarios reales creados por el seed
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

async function testRealUsers() {
  console.log('🔐 Probando usuarios reales del seed...\n');

  // Usuarios creados por el seed
  const realUsers = [
    { 
      email: 'empresa.agente@demo.com', 
      password: 'Admin123!',
      role: 'Administrador/Empresa'
    },
    { 
      email: 'cliente.agente1@demo.com', 
      password: 'Cliente123!',
      role: 'Cliente 1'
    },
    { 
      email: 'chofer.agente1@demo.com', 
      password: 'Conductor123!',
      role: 'Chofer 1'
    },
    { 
      email: 'cliente.agente2@demo.com', 
      password: 'Cliente123!',
      role: 'Cliente 2'
    },
    { 
      email: 'chofer.agente2@demo.com', 
      password: 'Conductor123!',
      role: 'Chofer 2'
    }
  ];

  let validUsers = [];

  for (const user of realUsers) {
    try {
      console.log(`🔐 Probando: ${user.email} (${user.role})`);
      const response = await makeRequest('/api/v1/auth/login', 'POST', user);
      
      if (response.statusCode === 200) {
        console.log(`✅ USUARIO VÁLIDO: ${user.email}`);
        console.log(`   Rol: ${user.role}`);
        console.log(`   Password: ${user.password}`);
        
        const responseData = JSON.parse(response.body);
        if (responseData.data?.token) {
          console.log(`   Token: ${responseData.data.token.substring(0, 50)}...`);
        }
        
        validUsers.push(user);
        console.log('');
      } else {
        console.log(`❌ Inválido: ${user.email} (Status: ${response.statusCode})`);
      }
    } catch (error) {
      console.log(`❌ Error con ${user.email}: ${error.message}`);
    }
  }

  if (validUsers.length > 0) {
    console.log('🎉 ¡USUARIOS VÁLIDOS ENCONTRADOS!\n');
    console.log('📱 ACCESOS PARA PRUEBAS:\n');
    
    validUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.role}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   Frontend: http://localhost:5173`);
      console.log('');
    });

    console.log('🌐 Para probar en el frontend:');
    console.log('1. Abre http://localhost:5173');
    console.log('2. Usa cualquiera de las credenciales above');
    console.log('3. Explora las diferentes vistas según el rol\n');

    console.log('📡 Para probar API directamente:');
    console.log('curl -X POST http://localhost:4000/api/v1/auth/login \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"email":"empresa.agente@demo.com","password":"Admin123!"}\'');
  } else {
    console.log('❌ No se encontraron usuarios válidos');
    console.log('🔧 Verifica que el servidor esté corriendo y la base de datos conectada');
  }
}

testRealUsers();
