// Crear un chofer de prueba con credenciales conocidas
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

async function createTestDriver() {
  console.log('🚛 CREANDO CHOFER DE PRUEBA CON ACCESO\n');

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
        console.log(`${index + 1}. ${vehicle.plate} (${vehicle.kind})`);
      });
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  // 3. Crear chofer de prueba
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

  console.log('\n👤 CREANDO CHOFER DE PRUEBA:');
  console.log(`   Nombre: ${driverData.fullName}`);
  console.log(`   Email: ${driverData.email}`);
  console.log(`   Teléfono: ${driverData.phone}`);
  console.log(`   Licencia: ${driverData.licenseNumber}`);
  console.log(`   Vehículo asignado: ${vehicles.length > 0 ? vehicles[0].plate : 'Sin asignar'}`);

  try {
    const response = await makeRequest('/api/v1/drivers', 'POST', driverData, {
      'Authorization': `Bearer ${adminToken}`
    });

    if (response.statusCode === 201) {
      const data = JSON.parse(response.body);
      const createdDriver = data.data;
      
      console.log('\n✅ CHOFER CREADO EXITOSAMENTE:');
      console.log(`   ID: ${createdDriver.id}`);
      console.log(`   Nombre: ${createdDriver.fullName}`);
      console.log(`   Email: ${createdDriver.email}`);
      console.log(`   Teléfono: ${createdDriver.phone}`);
      console.log(`   Estado: ${createdDriver.status}`);
      
      if (createdDriver.assignedVehicle) {
        console.log(`   Vehículo: ${createdDriver.assignedVehicle.plate}`);
      }

      // 4. Probar login con el nuevo chofer
      console.log('\n🔐 PROBANDO LOGIN CON NUEVO CHOFER:');
      
      const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
        email: driverData.email,
        password: 'Chofer123!' // Contraseña por defecto
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
        console.log(`   Token: ${driverToken?.substring(0, 20)}...`);

        // 5. Probar acceso al panel de chofer
        console.log('\n📱 PROBANDO ACCESO AL PANEL DE CHOFER:');
        
        try {
          // Obtener envíos asignados
          const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
            'Authorization': `Bearer ${driverToken}`
          });
          
          if (shipmentsResponse.statusCode === 200) {
            const shipmentsData = JSON.parse(shipmentsResponse.body);
            const shipments = shipmentsData.data || [];
            
            console.log('✅ ENVÍOS ASIGNADOS AL CHOFER:');
            console.log(`   Total: ${shipments.length}`);
            
            if (shipments.length > 0) {
              console.log('\n   📋 DETALLE DE ENVÍOS:');
              shipments.forEach((shipment, index) => {
                console.log(`   ${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
                console.log(`      Ruta: ${shipment.origin} → ${shipment.destination}`);
                console.log(`      Estado: ${shipment.status}`);
                console.log(`      Cliente: ${shipment.customer?.name}`);
                console.log(`      Vehículo: ${shipment.vehicle?.plate || 'N/A'}`);
                console.log(`      Monto: $${shipment.amount?.toLocaleString('es-CL') || 'N/A'}`);
                console.log('');
              });
            } else {
              console.log('   No hay envíos asignados actualmente');
            }
          } else {
            console.log('❌ Error obteniendo envíos:', shipmentsResponse.statusCode);
          }

          // Obtener perfil del chofer
          const profileResponse = await makeRequest('/api/v1/driver/profile', 'GET', null, {
            'Authorization': `Bearer ${driverToken}`
          });
          
          if (profileResponse.statusCode === 200) {
            console.log('✅ PERFIL DEL CHOFER: Accesible');
          } else {
            console.log('❌ Error obteniendo perfil:', profileResponse.statusCode);
          }

        } catch (error) {
          console.log('❌ Error probando panel de chofer:', error.message);
        }

        // 6. Resumen final
        console.log('\n🎯 ACCESO COMO CHOFER - LISTO PARA USAR');
        console.log('✅ CREDENCIALES DEL CHOFER:');
        console.log(`   Email: ${driverData.email}`);
        console.log(`   Password: Chofer123!`);
        console.log(`   Nombre: ${driverData.fullName}`);
        console.log(`   Rol: Conductor`);
        
        console.log('\n🌐 PARA ACCEDER AL PANEL DE CHOFER:');
        console.log('1. Ir a: http://localhost:5174/conductor');
        console.log(`2. Email: ${driverData.email}`);
        console.log('3. Password: Chofer123!');
        console.log('4. Verás tu dashboard con envíos asignados');
        console.log('5. Podrás actualizar estados y ver detalles');
        
        console.log('\n🔧 FUNCIONALIDADES DISPONIBLES:');
        console.log('✅ Ver envíos asignados');
        console.log('✅ Actualizar estado de envíos');
        console.log('✅ Ver mapa y rutas');
        console.log('✅ Contactar clientes');
        console.log('✅ Registrar ubicación GPS');
        console.log('✅ Ver perfil y estadísticas');

      } else {
        console.log('❌ Error login con nuevo chofer:', loginResponse.statusCode);
        console.log('   Respuesta:', loginResponse.body);
      }

    } else {
      console.log('❌ Error creando chofer:', response.statusCode);
      console.log('   Respuesta:', response.body);
    }

  } catch (error) {
    console.log('❌ Error creando chofer:', error.message);
  }
}

createTestDriver();
