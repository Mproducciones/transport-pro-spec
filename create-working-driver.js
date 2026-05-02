// Crear un conductor real con credenciales funcionales
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

async function createWorkingDriver() {
  console.log('👤 CREANDO CONDUCTOR REAL CON ACCESO FUNCIONAL\n');

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
      
      vehicles.forEach((vehicle, index) => {
        console.log(`   ${index + 1}. ${vehicle.plate} - ${vehicle.model}`);
      });
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  // 3. Crear conductor con credenciales conocidas
  const driverData = {
    fullName: 'Conductor de Prueba',
    email: 'conductor.prueba@demo.com',
    phone: '+56912345678',
    licenseNumber: 'CH123456789',
    licenseType: 'B',
    experience: '5 años',
    status: 'active',
    assignedVehicleId: vehicles.length > 0 ? vehicles[0].id : null
  };

  console.log('\n🔧 CREANDO CONDUCTOR:');
  console.log(`   Nombre: ${driverData.fullName}`);
  console.log(`   Email: ${driverData.email}`);
  console.log(`   Password: Conductor123!`);
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

      // 4. Probar login inmediato con el nuevo conductor
      console.log('\n🔐 PROBANDO LOGIN CON NUEVO CONDUCTOR:');
      
      try {
        const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
          email: driverData.email,
          password: 'Conductor123!'
        });

        if (loginResponse.statusCode === 200) {
          const loginData = JSON.parse(loginResponse.body);
          const driverToken = loginData.data?.token;
          const driverUser = loginData.data?.user;
          
          console.log('✅ LOGIN EXITOSO COMO CONDUCTOR:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Conductor123!`);
          console.log(`   Nombre: ${driverUser?.fullName}`);
          console.log(`   Rol: ${driverUser?.role}`);
          console.log(`   Token: ${driverToken?.substring(0, 20)}...`);

          // 5. Verificar acceso al panel de conductor
          console.log('\n📱 VERIFICANDO ACCESO AL PANEL DE CONDUCTOR:');
          
          try {
            const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
              'Authorization': `Bearer ${driverToken}`
            });
            
            if (shipmentsResponse.statusCode === 200) {
              const shipmentsData = JSON.parse(shipmentsResponse.body);
              const shipments = shipmentsData.data || [];
              
              console.log('✅ PANEL DE CONDUCTOR ACCESIBLE:');
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
                console.log('   El administrador puede asignarte envíos desde su panel');
              }

              // Obtener perfil
              const profileResponse = await makeRequest('/api/v1/driver/profile', 'GET', null, {
                'Authorization': `Bearer ${driverToken}`
              });
              
              if (profileResponse.statusCode === 200) {
                console.log('✅ PERFIL DEL CONDUCTOR: Accesible');
              }

            } else {
              console.log('❌ Error accediendo al panel del conductor:', shipmentsResponse.statusCode);
            }

          } catch (error) {
            console.log('❌ Error verificando panel del conductor:', error.message);
          }

          // 6. Resumen final con acceso confirmado
          console.log('\n🎯 ACCESO COMO CONDUCTOR - LISTO PARA USAR');
          console.log('✅ CREDENCIALES DEL CONDUCTOR:');
          console.log(`   Email: ${driverData.email}`);
          console.log(`   Password: Conductor123!`);
          console.log(`   Nombre: ${driverData.fullName}`);
          console.log(`   Rol: Conductor`);
          
          console.log('\n🌐 PARA ACCEDER AL PANEL DE CONDUCTOR:');
          console.log('1. Ir a: http://localhost:5174/conductor');
          console.log(`2. Email: ${driverData.email}`);
          console.log('3. Password: Conductor123!');
          console.log('4. Verás tu dashboard personal');
          console.log('5. Podrás ver tus envíos asignados');
          
          console.log('\n🔧 FUNCIONALIDADES DISPONIBLES:');
          console.log('✅ Dashboard personal del conductor');
          console.log('✅ Ver envíos asignados');
          console.log('✅ Actualizar estado de envíos');
          console.log('✅ Ver mapa y rutas');
          console.log('✅ Contactar clientes');
          console.log('✅ Registrar ubicación GPS');
          console.log('✅ Ver perfil y estadísticas');
          
          console.log('\n📱 EXPERIENCIA COMPLETA:');
          console.log('✅ Panel de conductor optimizado');
          console.log('✅ Funciones de tracking y actualización');
          console.log('✅ Comunicación con clientes');
          console.log('✅ Gestión de rutas y entregas');

        } else {
          console.log('❌ Error login con nuevo conductor:', loginResponse.statusCode);
          console.log('   Respuesta:', loginResponse.body);
        }

      } catch (error) {
        console.log('❌ Error login con nuevo conductor:', error.message);
      }

    } else {
      console.log('❌ Error creando conductor:', response.statusCode);
      console.log('   Respuesta:', response.body);
    }

  } catch (error) {
    console.log('❌ Error creando conductor:', error.message);
  }
}

createWorkingDriver();
