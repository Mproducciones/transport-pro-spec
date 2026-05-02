// Crear chofer de prueba simple
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

async function createDriverSimple() {
  console.log('🚛 CREANDO CHOFER DE PRUEBA\n');

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

  // 2. Obtener vehículos
  let vehicles = [];
  try {
    const response = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      vehicles = data.data || [];
      console.log(`✅ Vehículos encontrados: ${vehicles.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  // 3. Crear chofer
  const driverData = {
    fullName: 'Chofer de Prueba Transport',
    email: 'chofer.prueba@demo.com',
    phone: '+56912345678',
    licenseNumber: 'CH123456789',
    licenseType: 'B',
    experience: '5 años',
    status: 'active',
    assignedVehicleId: vehicles.length > 0 ? vehicles[0].id : null
  };

  console.log('\n👤 Creando chofer:');
  console.log(`   Nombre: ${driverData.fullName}`);
  console.log(`   Email: ${driverData.email}`);
  console.log(`   Teléfono: ${driverData.phone}`);

  try {
    const response = await makeRequest('/api/v1/drivers', 'POST', driverData, {
      'Authorization': `Bearer ${adminToken}`
    });

    if (response.statusCode === 201) {
      const data = JSON.parse(response.body);
      const createdDriver = data.data;
      
      console.log('\n✅ CHOFER CREADO:');
      console.log(`   ID: ${createdDriver.id}`);
      console.log(`   Nombre: ${createdDriver.fullName}`);
      console.log(`   Email: ${createdDriver.email}`);
      
      if (createdDriver.assignedVehicle) {
        console.log(`   Vehículo: ${createdDriver.assignedVehicle.plate}`);
      }

      // 4. Probar login
      console.log('\n🔐 Probando login como chofer...');
      
      try {
        const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
          email: driverData.email,
          password: 'Chofer123!'
        });

        if (loginResponse.statusCode === 200) {
          const loginData = JSON.parse(loginResponse.body);
          const driverToken = loginData.data?.token;
          const driverUser = loginData.data?.user;
          
          console.log('✅ LOGIN EXITOSO COMO CHOFER:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Chofer123!`);
          console.log(`   Nombre: ${driverUser?.fullName}`);
          console.log(`   Rol: ${driverUser?.role}`);

          // 5. Verificar acceso
          try {
            const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
              'Authorization': `Bearer ${driverToken}`
            });
            
            if (shipmentsResponse.statusCode === 200) {
              const shipmentsData = JSON.parse(shipmentsResponse.body);
              const shipments = shipmentsData.data || [];
              
              console.log('\n✅ ACCESO AL PANEL DE CHOFER:');
              console.log(`   Envíos asignados: ${shipments.length}`);
              
              if (shipments.length > 0) {
                console.log('\n   📋 TUS ENVÍOS:');
                shipments.forEach((shipment, index) => {
                  console.log(`   ${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
                  console.log(`      Ruta: ${shipment.origin} → ${shipment.destination}`);
                  console.log(`      Estado: ${shipment.status}`);
                  console.log(`      Cliente: ${shipment.customer?.name}`);
                  console.log('');
                });
              } else {
                console.log('   No tienes envíos asignados actualmente');
              }
            }

          } catch (error) {
            console.log('❌ Error verificando panel:', error.message);
          }

          // 6. Resumen final
          console.log('\n🎯 ACCESO COMO CHOFER - LISTO');
          console.log('✅ CREDENCIALES:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Chofer123!`);
          console.log(`   Nombre: ${driverData.fullName}`);
          
          console.log('\n🌐 PARA ACCEDER:');
          console.log('1. Ir a: http://localhost:5174/conductor');
          console.log(`2. Email: ${driverData.email}`);
          console.log('3. Password: Chofer123!`);
          console.log('4. Verás tu dashboard de conductor');

        } else {
          console.log('❌ Error login chofer:', loginResponse.statusCode);
        }

      } catch (error) {
        console.log('❌ Error login chofer:', error.message);
      }

    } else {
      console.log('❌ Error creando chofer:', response.statusCode);
      console.log('   Respuesta:', response.body);
    }

  } catch (error) {
    console.log('❌ Error creando chofer:', error.message);
  }
}

createDriverSimple();
