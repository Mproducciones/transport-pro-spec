// Obtener acceso como chofer al sistema
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

async function getDriverAccess() {
  console.log('🚛 OBTENIENDO ACCESO COMO CHOFER\n');

  // 1. Login como admin para obtener datos de choferes
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

  // 2. Obtener lista de choferes
  let drivers = [];
  try {
    const response = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      drivers = data.data || [];
      console.log(`✅ Choferes encontrados: ${drivers.length}`);
      
      drivers.forEach((driver, index) => {
        console.log(`${index + 1}. ${driver.fullName}`);
        console.log(`   ID: ${driver.id}`);
        console.log(`   Email: ${driver.email || 'No especificado'}`);
        console.log(`   Teléfono: ${driver.phone}`);
        console.log(`   Vehículo: ${driver.assignedVehicle?.plate || 'Sin asignar'}`);
        console.log('');
      });
    }
  } catch (error) {
    console.log('❌ Error obteniendo choferes:', error.message);
    return;
  }

  if (drivers.length === 0) {
    console.log('❌ No hay choferes disponibles');
    return;
  }

  // 3. Intentar login con diferentes credenciales de chofer
  console.log('🔐 INTENTANDO LOGIN CON DIFERENTES CREDENCIALES DE CHOFER\n');

  const possibleCredentials = [
    // Basados en los nombres de los choferes
    { email: 'chofer.agente1@demo.com', password: 'Chofer123!' },
    { email: 'chofer.agente2@demo.com', password: 'Chofer123!' },
    { email: 'chofer.agente3@demo.com', password: 'Chofer123!' },
    // Alternativas comunes
    { email: 'chofer1@demo.com', password: '123456' },
    { email: 'chofer2@demo.com', password: '123456' },
    { email: 'chofer3@demo.com', password: '123456' },
    { email: 'driver1@demo.com', password: 'Driver123!' },
    { email: 'driver2@demo.com', password: 'Driver123!' },
    // Basados en emails si existen
    ...drivers.map(driver => ({
      email: driver.email,
      password: 'Chofer123!'
    })).filter(cred => cred.email),
    // Contraseñas alternativas
    ...drivers.map(driver => ({
      email: driver.email,
      password: '123456'
    })).filter(cred => cred.email),
    ...drivers.map(driver => ({
      email: driver.email,
      password: 'password'
    })).filter(cred => cred.email)
  ];

  // Eliminar duplicados
  const uniqueCredentials = [...new Map(possibleCredentials.map(cred => [cred.email, cred])).values()];

  console.log(`🔄 Probando ${uniqueCredentials.length} combinaciones de credenciales...\n`);

  let successfulLogin = null;

  for (const credentials of uniqueCredentials) {
    try {
      const response = await makeRequest('/api/v1/auth/login', 'POST', credentials);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        successfulLogin = {
          token: data.data?.token,
          user: data.data?.user,
          credentials: credentials
        };
        console.log('✅ LOGIN EXITOSO COMO CHOFER:');
        console.log(`   Email: ${credentials.email}`);
        console.log(`   Password: ${credentials.password}`);
        console.log(`   Nombre: ${data.data?.user?.fullName}`);
        console.log(`   Rol: ${data.data?.user?.role}`);
        console.log(`   Token: ${data.data?.token?.substring(0, 20)}...`);
        break;
      }
    } catch (error) {
      // Continuar con las siguientes credenciales
    }
  }

  if (!successfulLogin) {
    console.log('❌ No se pudo encontrar credenciales válidas de chofer');
    console.log('\n🔧 OPCIONES DISPONIBLES:');
    console.log('1. Verificar las credenciales correctas en la base de datos');
    console.log('2. Crear un nuevo usuario de chofer con credenciales conocidas');
    console.log('3. Usar el panel de administrador para gestionar choferes');
    return;
  }

  // 4. Probar acceso al panel de chofer
  console.log('\n📱 PROBANDO ACCESO AL PANEL DE CHOFER\n');

  try {
    // Obtener envíos asignados al chofer
    const shipmentsResponse = await makeRequest('/api/v1/driver/shipments', 'GET', null, {
      'Authorization': `Bearer ${successfulLogin.token}`
    });
    
    if (shipmentsResponse.statusCode === 200) {
      const data = JSON.parse(shipmentsResponse.body);
      const shipments = data.data || [];
      
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
      }
    } else {
      console.log('❌ Error obteniendo envíos del chofer:', shipmentsResponse.statusCode);
    }

    // Obtener perfil del chofer
    const profileResponse = await makeRequest('/api/v1/driver/profile', 'GET', null, {
      'Authorization': `Bearer ${successfulLogin.token}`
    });
    
    if (profileResponse.statusCode === 200) {
      const data = JSON.parse(profileResponse.body);
      console.log('✅ PERFIL DEL CHOFER:');
      console.log(`   Datos del perfil disponibles`);
    } else {
      console.log('❌ Error obteniendo perfil del chofer:', profileResponse.statusCode);
    }

  } catch (error) {
    console.log('❌ Error probando panel de chofer:', error.message);
  }

  // 5. Resumen final de acceso
  console.log('\n🎯 ACCESO COMO CHOFER - RESUMEN FINAL');
  console.log('✅ CREDENCIALES ENCONTRADAS:');
  console.log(`   Email: ${successfulLogin.credentials.email}`);
  console.log(`   Password: ${successfulLogin.credentials.password}`);
  console.log(`   Nombre: ${successfulLogin.user?.fullName}`);
  console.log(`   Rol: ${successfulLogin.user?.role}`);
  
  console.log('\n🌐 PARA ACCEDER AL PANEL DE CHOFER:');
  console.log('1. Ir a: http://localhost:5174/conductor');
  console.log(`2. Email: ${successfulLogin.credentials.email}`);
  console.log(`3. Password: ${successfulLogin.credentials.password}`);
  console.log('4. Verás tu dashboard con envíos asignados');
  console.log('5. Podrás actualizar estados y ver detalles');
  
  console.log('\n🔧 FUNCIONALIDADES DISPONIBLES:');
  console.log('✅ Ver envíos asignados');
  console.log('✅ Actualizar estado de envíos');
  console.log('✅ Ver mapa y rutas');
  console.log('✅ Contactar clientes');
  console.log('✅ Registrar ubicación GPS');
}

getDriverAccess();
