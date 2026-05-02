// Verificar credenciales correctas de conductor
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

async function verifyDriverCredentials() {
  console.log('🔍 VERIFICANDO CREDENCIALES CORRECTAS DE CONDUCTOR\n');

  // 1. Login como admin para obtener datos de conductores
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

  // 2. Obtener lista de conductores
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
        console.log(`   Email: ${driver.email || 'No especificado'}`);
        console.log(`   Teléfono: ${driver.phone}`);
        console.log(`   Estado: ${driver.status}`);
        console.log(`   Vehículo: ${driver.assignedVehicle?.plate || 'Sin asignar'}`);
        console.log('');
      });
    }
  } catch (error) {
    console.log('❌ Error obteniendo conductores:', error.message);
    return;
  }

  // 3. Probar diferentes credenciales de conductor
  console.log('🔐 PROBANDO CREDENCIALES DE CONDUCTOR\n');
  
  const possibleCredentials = [
    { email: 'conductor@demo.com', password: 'Conductor123!' },
    { email: 'conductor@demo.com', password: '123456' },
    { email: 'conductor@demo.com', password: 'password' },
    { email: 'chofer.agente1@demo.com', password: 'Chofer123!' },
    { email: 'chofer.agente1@demo.com', password: '123456' },
    { email: 'chofer.agente1@demo.com', password: 'password' },
    { email: 'chofer.agente2@demo.com', password: 'Chofer123!' },
    { email: 'chofer.agente2@demo.com', password: '123456' },
    { email: 'driver1@demo.com', password: 'Driver123!' },
    { email: 'driver1@demo.com', password: '123456' },
    // Basados en emails de conductores si existen
    ...drivers.map(driver => ({
      email: driver.email,
      password: 'Conductor123!'
    })).filter(cred => cred.email),
    ...drivers.map(driver => ({
      email: driver.email,
      password: '123456'
    })).filter(cred => cred.email)
  ];

  // Eliminar duplicados
  const uniqueCredentials = [...new Map(possibleCredentials.map(cred => [cred.email, cred])).values()];

  let workingCredentials = null;

  for (const credentials of uniqueCredentials) {
    try {
      console.log(`📝 Probando: ${credentials.email}`);
      
      const response = await makeRequest('/api/v1/auth/login', 'POST', credentials);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        workingCredentials = {
          email: credentials.email,
          password: credentials.password,
          user: data.data?.user,
          token: data.data?.token
        };
        
        console.log('✅ LOGIN EXITOSO:');
        console.log(`   Email: ${credentials.email}`);
        console.log(`   Password: ${credentials.password}`);
        console.log(`   Nombre: ${data.data?.user?.fullName}`);
        console.log(`   Rol: ${data.data?.user?.role}`);
        console.log(`   Token: ${data.data?.token?.substring(0, 20)}...`);
        break;
      } else if (response.statusCode === 401) {
        console.log('   ❌ Credenciales inválidas');
      } else {
        console.log(`   ❌ Error: ${response.statusCode}`);
      }
    } catch (error) {
      console.log('   ❌ Error de conexión');
    }
  }

  if (workingCredentials) {
    console.log('\n🎯 CREDENCIALES CORRECTAS ENCONTRADAS');
    console.log('✅ ACCESO COMO CONDUCTOR:');
    console.log(`   URL: http://localhost:5174/conductor`);
    console.log(`   Email: ${workingCredentials.email}`);
    console.log(`   Password: ${workingCredentials.password}`);
    console.log(`   Nombre: ${workingCredentials.user?.fullName}`);
    console.log(`   Rol: ${workingCredentials.user?.role}`);
    
    // 4. Verificar acceso al panel de conductor
    console.log('\n📱 VERIFICANDO ACCESO AL PANEL DE CONDUCTOR');
    
    try {
      const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
        'Authorization': `Bearer ${workingCredentials.token}`
      });
      
      if (shipmentsResponse.statusCode === 200) {
        const shipmentsData = JSON.parse(shipmentsResponse.body);
        const shipments = shipmentsData.data || [];
        
        console.log('✅ PANEL DE CONDUCTOR ACCESIBLE');
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
        }
      } else {
        console.log('❌ Error accediendo al panel del conductor:', shipmentsResponse.statusCode);
      }
    } catch (error) {
      console.log('❌ Error verificando panel del conductor:', error.message);
    }
    
  } else {
    console.log('\n❌ NO SE ENCONTRARON CREDENCIALES VÁLIDAS');
    console.log('🔧 OPCIONES:');
    console.log('1. Verificar las credenciales correctas en la base de datos');
    console.log('2. Crear un nuevo conductor con credenciales conocidas');
    console.log('3. Usar el panel de administrador para gestionar conductores');
  }
}

verifyDriverCredentials();
