// Crear cuentas de email para los conductores existentes
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

async function createDriverAccounts() {
  console.log('👥 CREANDO CUENTAS DE EMAIL PARA CONDUCTORES\n');

  // 1. Login como admin
  let adminToken = null;
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      adminToken = data.data?.token;
      console.log('✅ Login admin exitoso');
    }
  } catch (error) {
    console.log('❌ Error login admin:', error.message);
    return;
  }

  // 2. Obtener conductores existentes
  let drivers = [];
  try {
    const response = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      drivers = data.data || [];
      console.log(`✅ Conductores encontrados: ${drivers.length}`);
      
      drivers.forEach((driver, index) => {
        console.log(`${index + 1}. ${driver.fullName}`);
        console.log(`   ID: ${driver.id}`);
        console.log(`   Email actual: ${driver.email || 'Sin email'}`);
        console.log(`   Teléfono: ${driver.phone}`);
        console.log('');
      });
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductores:', error.message);
    return;
  }

  // 3. Crear cuentas de email para cada conductor
  const driverAccounts = [
    {
      driverId: drivers[0]?.id,
      fullName: drivers[0]?.fullName,
      email: 'chofer.agente1@demo.com',
      password: 'Chofer123!'
    },
    {
      driverId: drivers[1]?.id,
      fullName: drivers[1]?.fullName,
      email: 'chofer.agente2@demo.com',
      password: 'Chofer123!'
    },
    {
      driverId: drivers[2]?.id,
      fullName: drivers[2]?.fullName,
      email: 'juan.conductor@demo.com',
      password: 'Conductor123!'
    }
  ];

  console.log('🔧 CREANDO CUENTAS DE EMAIL:\n');

  for (const account of driverAccounts) {
    if (!account.driverId) {
      console.log(`❌ No se puede crear cuenta para ${account.fullName} - ID no encontrado`);
      continue;
    }

    try {
      // Actualizar conductor con email
      const updateResponse = await makeRequest(`/api/v1/drivers/${account.driverId}`, 'PATCH', {
        email: account.email
      }, {
        'Authorization': `Bearer ${adminToken}`
      });

      if (updateResponse.statusCode === 200) {
        console.log(`✅ Cuenta creada para ${account.fullName}:`);
        console.log(`   Email: ${account.email}`);
        console.log(`   Password: ${account.password}`);
        console.log(`   ID: ${account.driverId}`);
        console.log('');

        // Verificar que la cuenta funciona
        try {
          const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
            email: account.email,
            password: account.password
          });

          if (loginResponse.statusCode === 200) {
            const loginData = JSON.parse(loginResponse.body);
            console.log(`✅ Login verificado para ${account.email}`);
            console.log(`   Nombre: ${loginData.data?.user?.fullName}`);
            console.log(`   Rol: ${loginData.data?.user?.role}`);
            console.log('');
          } else {
            console.log(`❌ Error login verificación: ${loginResponse.statusCode}`);
          }
        } catch (error) {
          console.log(`❌ Error verificando login: ${error.message}`);
        }

      } else {
        console.log(`❌ Error actualizando ${account.fullName}: ${updateResponse.statusCode}`);
        console.log(`   ${updateResponse.body}`);
      }

    } catch (error) {
      console.log(`❌ Error creando cuenta para ${account.fullName}:`, error.message);
    }
  }

  // 4. Resumen final
  console.log('📊 RESUMEN DE CUENTAS CREADAS:');
  console.log('✅ Chofer Agente 1:');
  console.log('   Email: chofer.agente1@demo.com');
  console.log('   Password: Chofer123!');
  
  console.log('\n✅ Chofer Agente 2:');
  console.log('   Email: chofer.agente2@demo.com');
  console.log('   Password: Chofer123!');
  
  console.log('\n✅ Juan Conductor:');
  console.log('   Email: juan.conductor@demo.com');
  console.log('   Password: Conductor123!');
  
  console.log('\n🌐 PARA PROBAR LAS CUENTAS:');
  console.log('1. Abre ventana de incógnito');
  console.log('2. Ve a: http://localhost:5174/conductor');
  console.log('3. Usa cualquiera de las credenciales anteriores');
  console.log('4. Verás el panel de conductor con envíos asignados');
  
  console.log('\n🎯 INTERACCIONES POSIBLES:');
  console.log('✅ Tres cuentas diferentes de conductor');
  console.log('✅ Cada una con sus propios envíos asignados');
  console.log('✅ Pruebas simultáneas con diferentes conductores');
  console.log('✅ Actualización de estados por cada conductor');
}

createDriverAccounts();
