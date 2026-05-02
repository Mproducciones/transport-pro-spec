// Crear conductor con taxId requerido
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

async function createDriverWithTaxId() {
  console.log('👤 CREANDO CONDUCTOR CON TAXID REQUERIDO\n');

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

  // 2. Obtener vehículos disponibles
  let vehicles = [];
  try {
    const response = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      vehicles = data.data || [];
      console.log(`✅ Vehículos disponibles: ${vehicles.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  // 3. Crear conductor con taxId incluido
  const driverData = {
    fullName: 'Conductor de Prueba',
    email: 'conductor.prueba@demo.com',
    phone: '+56912345678',
    taxId: '12.345.678-9', // RUT chileno válido
    licenseNumber: 'CH123456789',
    licenseType: 'B',
    experience: '5 años',
    status: 'active',
    assignedVehicleId: vehicles.length > 0 ? vehicles[0].id : null
  };

  console.log('\n🔧 CREANDO CONDUCTOR CON TAXID:');
  console.log(`   Nombre: ${driverData.fullName}`);
  console.log(`   Email: ${driverData.email}`);
  console.log(`   Password: Conductor123!`);
  console.log(`   TaxId: ${driverData.taxId}`);
  console.log(`   Teléfono: ${driverData.phone}`);
  console.log(`   Vehículo: ${vehicles.length > 0 ? vehicles[0].plate : 'Sin asignar'}`);

  try {
    const response = await makeRequest('/api/v1/drivers', 'POST', driverData, {
      'Authorization': `Bearer ${adminToken}`
    });

    if (response.statusCode === 201) {
      const data = JSON.parse(response.body);
      const createdDriver = data.data;
      
      console.log('\n✅ CONDUCTOR CREADO EXITOSAMENTE:');
      console.log(`   ID: ${createdDriver.id}`);
      console.log(`   Nombre: ${createdDriver.fullName}`);
      console.log(`   Email: ${createdDriver.email}`);
      console.log(`   Estado: ${createdDriver.status}`);
      
      if (createdDriver.assignedVehicle) {
        console.log(`   Vehículo: ${createdDriver.assignedVehicle.plate}`);
      }

      // 4. Probar login inmediato
      console.log('\n🔐 PROBANDO LOGIN:');
      
      try {
        const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
          email: driverData.email,
          password: 'Conductor123!'
        });

        if (loginResponse.statusCode === 200) {
          const loginData = JSON.parse(loginResponse.body);
          const driverToken = loginData.data?.token;
          const driverUser = loginData.data?.user;
          
          console.log('✅ LOGIN EXITOSO:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Conductor123!`);
          console.log(`   Nombre: ${driverUser?.fullName}`);
          console.log(`   Rol: ${driverUser?.role}`);

          // 5. Verificar acceso al panel
          try {
            const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
              'Authorization': `Bearer ${driverToken}`
            });
            
            if (shipmentsResponse.statusCode === 200) {
              const shipmentsData = JSON.parse(shipmentsResponse.body);
              const shipments = shipmentsData.data || [];
              
              console.log('\n✅ ACCESO AL PANEL DE CONDUCTOR:');
              console.log(`   Envíos asignados: ${shipments.length}`);
            }

          } catch (error) {
            console.log('❌ Error verificando panel:', error.message);
          }

          // 6. Resumen final
          console.log('\n🎯 ACCESO COMO CONDUCTOR - LISTO');
          console.log('✅ CREDENCIALES:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Conductor123!`);
          console.log(`   Nombre: ${driverData.fullName}`);
          
          console.log('\n🌐 PARA ACCEDER:');
          console.log('1. Ir a: http://localhost:5174/conductor');
          console.log(`2. Email: ${driverData.email}`);
          console.log('3. Password: Conductor123!');
          console.log('4. Verás tu dashboard');

        } else {
          console.log('❌ Error login:', loginResponse.statusCode);
        }

      } catch (error) {
        console.log('❌ Error login:', error.message);
      }

    } else {
      console.log('❌ Error creando conductor:', response.statusCode);
      console.log('   Respuesta:', response.body);
    }

  } catch (error) {
    console.log('❌ Error creando conductor:', error.message);
  }
}

createDriverWithTaxId();
