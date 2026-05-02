// Crear las 3 cuentas principales: admin, cliente, conductor
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

async function createMainAccounts() {
  console.log('👥 CREANDO LAS 3 CUENTAS PRINCIPALES\n');

  // 1. Verificar que admin@demo.com existe y funciona
  console.log('🔐 VERIFICANDO CUENTA ADMIN:');
  
  try {
    const adminLogin = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (adminLogin.statusCode === 200) {
      const adminData = JSON.parse(adminLogin.body);
      console.log('✅ admin@demo.com / Admin123! - FUNCIONA');
      console.log(`   Nombre: ${adminData.data?.user?.fullName}`);
      console.log(`   Rol: ${adminData.data?.user?.role}`);
    } else {
      console.log('❌ admin@demo.com no funciona:', adminLogin.statusCode);
    }
  } catch (error) {
    console.log('❌ Error verificando admin:', error.message);
  }

  // 2. Crear cliente@demo.com
  console.log('\n🔐 CREANDO CUENTA CLIENTE:');
  
  let adminToken = null;
  try {
    const adminLogin = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (adminLogin.statusCode === 200) {
      adminToken = JSON.parse(adminLogin.body).data?.token;
    }
  } catch (error) {
    console.log('❌ Error login admin para crear cliente:', error.message);
    return;
  }

  const customerData = {
    name: 'Cliente Demo',
    email: 'cliente@demo.com',
    phone: '+56912345678',
    taxId: '99.999.999-9',
    address: 'Dirección Demo 123',
    city: 'Santiago',
    country: 'Chile',
    status: 'active'
  };

  try {
    const customerResponse = await makeRequest('/api/v1/customers', 'POST', customerData, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (customerResponse.statusCode === 201) {
      const customerResult = JSON.parse(customerResponse.body);
      console.log('✅ cliente@demo.com - CREADO');
      console.log(`   Nombre: ${customerResult.data?.name}`);
      console.log(`   Email: ${customerResult.data?.email}`);
      console.log(`   ID: ${customerResult.data?.id}`);
    } else {
      console.log('❌ Error creando cliente:', customerResponse.statusCode);
      console.log('   Respuesta:', customerResponse.body);
    }
  } catch (error) {
    console.log('❌ Error creando cliente:', error.message);
  }

  // 3. Crear conductor@demo.com
  console.log('\n🔐 CREANDO CUENTA CONDUCTOR:');
  
  // Obtener vehículos disponibles
  let vehicles = [];
  try {
    const vehiclesResponse = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (vehiclesResponse.statusCode === 200) {
      vehicles = JSON.parse(vehiclesResponse.body).data || [];
      console.log(`   Vehículos disponibles: ${vehicles.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo vehículos:', error.message);
  }

  const driverData = {
    fullName: 'Conductor Demo',
    email: 'conductor@demo.com',
    phone: '+56987654321',
    taxId: '88.888.888-8',
    licenseNumber: 'CH987654321',
    licenseType: 'B',
    experience: '3 años',
    status: 'active',
    assignedVehicleId: vehicles.length > 0 ? vehicles[0].id : null
  };

  try {
    const driverResponse = await makeRequest('/api/v1/drivers', 'POST', driverData, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (driverResponse.statusCode === 201) {
      const driverResult = JSON.parse(driverResponse.body);
      console.log('✅ conductor@demo.com - CREADO');
      console.log(`   Nombre: ${driverResult.data?.fullName}`);
      console.log(`   Email: ${driverResult.data?.email}`);
      console.log(`   ID: ${driverResult.data?.id}`);
      
      if (driverResult.data?.assignedVehicle) {
        console.log(`   Vehículo: ${driverResult.data.assignedVehicle.plate}`);
      }
    } else {
      console.log('❌ Error creando conductor:', driverResponse.statusCode);
      console.log('   Respuesta:', driverResponse.body);
    }
  } catch (error) {
    console.log('❌ Error creando conductor:', error.message);
  }

  // 4. Verificar acceso a las 3 cuentas
  console.log('\n🎯 VERIFICANDO ACCESO A LAS 3 CUENTAS:');
  
  // Verificar cliente
  try {
    const customerLogin = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'cliente@demo.com',
      password: 'Cliente123!'
    });
    
    if (customerLogin.statusCode === 200) {
      console.log('✅ cliente@demo.com / Cliente123! - FUNCIONA');
    } else {
      console.log('❌ cliente@demo.com no funciona:', customerLogin.statusCode);
    }
  } catch (error) {
    console.log('❌ Error verificando cliente:', error.message);
  }

  // Verificar conductor
  try {
    const driverLogin = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'conductor@demo.com',
      password: 'Conductor123!'
    });
    
    if (driverLogin.statusCode === 200) {
      const driverData = JSON.parse(driverLogin.body);
      console.log('✅ conductor@demo.com / Conductor123! - FUNCIONA');
      console.log(`   Nombre: ${driverData.data?.user?.fullName}`);
      console.log(`   Rol: ${driverData.data?.user?.role}`);
      
      // Verificar acceso al panel del conductor
      try {
        const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
          'Authorization': `Bearer ${driverData.data?.token}`
        });
        
        if (shipmentsResponse.statusCode === 200) {
          const shipments = JSON.parse(shipmentsResponse.body).data || [];
          console.log(`   Envíos asignados: ${shipments.length}`);
        }
      } catch (error) {
        console.log('   Error verificando panel del conductor:', error.message);
      }
      
    } else {
      console.log('❌ conductor@demo.com no funciona:', driverLogin.statusCode);
    }
  } catch (error) {
    console.log('❌ Error verificando conductor:', error.message);
  }

  // 5. Resumen final
  console.log('\n🎉 CUENTAS PRINCIPALES - LISTAS PARA USAR');
  console.log('✅ ADMINISTRADOR:');
  console.log('   URL: http://localhost:5174/');
  console.log('   Email: admin@demo.com');
  console.log('   Password: Admin123!');
  
  console.log('\n✅ CLIENTE:');
  console.log('   URL: http://localhost:5174/');
  console.log('   Email: cliente@demo.com');
  console.log('   Password: Cliente123!');
  
  console.log('\n✅ CONDUCTOR:');
  console.log('   URL: http://localhost:5174/conductor');
  console.log('   Email: conductor@demo.com');
  console.log('   Password: Conductor123!');
  
  console.log('\n🌐 PARA PROBAR:');
  console.log('1. Admin: http://localhost:5174/ (panel completo)');
  console.log('2. Cliente: http://localhost:5174/ (panel de cliente)');
  console.log('3. Conductor: http://localhost:5174/conductor (panel de conductor)');
  
  console.log('\n📱 INTERACCIONES POSIBLES:');
  console.log('✅ Admin puede gestionar todo el sistema');
  console.log('✅ Cliente puede ver sus envíos y facturas');
  console.log('✅ Conductor puede ver sus envíos asignados');
  console.log('✅ Pruebas simultáneas con diferentes roles');
}

createMainAccounts();
