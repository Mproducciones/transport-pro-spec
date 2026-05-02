// Crear solicitudes de envío desde clientes para que el administrador interactúe
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

async function createClientShipments() {
  console.log('👥 Creando solicitudes de envío desde clientes...\n');

  // Obtener clientes y sus credenciales
  let clients = [];
  let drivers = [];
  let vehicles = [];

  try {
    // Login como admin para obtener datos
    const adminResponse = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (adminResponse.statusCode === 200) {
      const adminData = JSON.parse(adminResponse.body);
      const adminToken = adminData.data?.token;

      // Obtener clientes
      const clientsResponse = await makeRequest('/api/v1/customers', 'GET', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      
      if (clientsResponse.statusCode === 200) {
        const clientsData = JSON.parse(clientsResponse.body);
        clients = clientsData.data || [];
        console.log(`👥 Clientes encontrados: ${clients.length}`);
      }

      // Obtener conductores
      const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      
      if (driversResponse.statusCode === 200) {
        const driversData = JSON.parse(driversResponse.body);
        drivers = driversData.data || [];
        console.log(`🚛 Conductores encontrados: ${drivers.length}`);
      }

      // Obtener vehículos
      const vehiclesResponse = await makeRequest('/api/v1/vehicles', 'GET', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      
      if (vehiclesResponse.statusCode === 200) {
        const vehiclesData = JSON.parse(vehiclesResponse.body);
        vehicles = vehiclesData.data || [];
        console.log(`🚗 Vehículos encontrados: ${vehicles.length}`);
      }
    }
  } catch (error) {
    console.log('❌ Error obteniendo datos:', error.message);
    return;
  }

  // Crear envíos desde diferentes clientes
  console.log('\n📦 Creando envíos desde clientes...\n');

  const testShipments = [
    {
      origin: 'Santiago, Providencia',
      destination: 'Viña del Mar, Centro',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 280,
      cargoVolumeM3: 1.8,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      amount: 75000,
      description: 'Envío de documentos importantes'
    },
    {
      origin: 'Concepción, Centro',
      destination: 'Chillán, Centro',
      cargoType: 'pallet',
      cargoQuantity: 5,
      cargoWeightKg: 150,
      cargoVolumeM3: 2.5,
      requiresHelper: true,
      scheduledPickup: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      amount: 120000,
      description: 'Envío de mercancía comercial'
    },
    {
      origin: 'Valparaíso, Puerto',
      destination: 'Santiago, Las Condes',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 450,
      cargoVolumeM3: 3.2,
      requiresHelper: true,
      scheduledPickup: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
      amount: 95000,
      description: 'Envío de equipamiento electrónico'
    },
    {
      origin: 'La Serena, Centro',
      destination: 'Coquimbo, Puerto',
      cargoType: 'granel',
      cargoQuantity: 8,
      cargoWeightKg: 320,
      cargoVolumeM3: 4.1,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
      amount: 85000,
      description: 'Envío de productos agrícolas'
    },
    {
      origin: 'Rancagua, Centro',
      destination: 'San Fernando, Centro',
      cargoType: 'otro',
      cargoQuantity: 4,
      cargoWeightKg: 200,
      cargoVolumeM3: 2.8,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      amount: 65000,
      description: 'Envío de documentos legales'
    }
  ];

  const createdShipments = [];

  for (let i = 0; i < Math.min(testShipments.length, clients.length); i++) {
    const shipment = testShipments[i];
    const client = clients[i];

    // Login como cliente
    let clientToken = null;
    try {
      const loginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
        email: client.email || `${client.name.toLowerCase().replace(/\s+/g, '.')}@demo.com`,
        password: 'Cliente123!'
      });

      if (loginResponse.statusCode === 200) {
        const loginData = JSON.parse(loginResponse.body);
        clientToken = loginData.data?.token;
      } else {
        // Si el login falla, intentar con contraseña genérica
        const altLoginResponse = await makeRequest('/api/v1/auth/login', 'POST', {
          email: client.email || `${client.name.toLowerCase().replace(/\s+/g, '.')}@demo.com`,
          password: '123456'
        });

        if (altLoginResponse.statusCode === 200) {
          const loginData = JSON.parse(altLoginResponse.body);
          clientToken = loginData.data?.token;
        }
      }
    } catch (error) {
      console.log(`❌ Error login cliente ${client.name}:`, error.message);
    }

    if (!clientToken) {
      console.log(`❌ No se pudo autenticar al cliente: ${client.name}`);
      continue;
    }

    // Crear envío como cliente
    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipment, {
        'Authorization': `Bearer ${clientToken}`
      });

      if (response.statusCode === 201) {
        const createdData = JSON.parse(response.body);
        createdShipments.push(createdData.data);
        console.log(`✅ Envío creado por cliente: ${client.name}`);
        console.log(`   ${shipment.origin} → ${shipment.destination}`);
        console.log(`   Estado: PENDIENTE (para aprobación)`);
        console.log(`   Monto: $${shipment.amount.toLocaleString('es-CL')}`);
        console.log(`   ID: ${createdData.data.id?.substring(-6).toUpperCase()}`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío para ${client.name}: ${response.statusCode}`);
        console.log(`   ${response.body}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío para ${client.name}:`, error.message);
    }
  }

  // Asignar conductor y vehículo a algunos envíos para pruebas
  console.log('🔧 Asignando conductor y vehículo a algunos envíos...\n');

  if (createdShipments.length > 0 && drivers.length > 0 && vehicles.length > 0) {
    // Login como admin para asignar
    const adminResponse = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });

    if (adminResponse.statusCode === 200) {
      const adminData = JSON.parse(adminResponse.body);
      const adminToken = adminData.data?.token;

      // Asignar a los primeros 2 envíos
      for (let i = 0; i < Math.min(2, createdShipments.length); i++) {
        const shipment = createdShipments[i];
        const driver = drivers[i % drivers.length];
        const vehicle = vehicles[i % vehicles.length];

        try {
          const assignResponse = await makeRequest(`/api/v1/shipments/${shipment.id}`, 'PATCH', {
            driverId: driver.id,
            vehicleId: vehicle.id
          }, {
            'Authorization': `Bearer ${adminToken}`
          });

          if (assignResponse.statusCode === 200) {
            console.log(`✅ Conductor y vehículo asignados: ${shipment.id?.substring(-6).toUpperCase()}`);
            console.log(`   Conductor: ${driver.fullName}`);
            console.log(`   Vehículo: ${vehicle.plate}`);
            console.log('');
          }
        } catch (error) {
          console.log(`❌ Error asignando conductor/vehículo:`, error.message);
        }
      }
    }
  }

  // Resumen final
  console.log('📊 RESUMEN FINAL:');
  console.log(`✅ Envíos creados: ${createdShipments.length}`);
  console.log('');
  
  createdShipments.forEach((shipment, index) => {
    console.log(`${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
    console.log(`   Estado: ${shipment.status}`);
    console.log(`   Ruta: ${shipment.origin} → ${shipment.destination}`);
    console.log(`   Cliente: ${shipment.customer?.name}`);
    console.log(`   Monto: $${shipment.amount?.toLocaleString('es-CL')}`);
    console.log(`   Conductor: ${shipment.driver?.fullName || 'Sin asignar'}`);
    console.log(`   Vehículo: ${shipment.vehicle?.plate || 'Sin asignar'}`);
    console.log('');
  });

  console.log('🌐 PARA PROBAR COMO ADMINISTRADOR:');
  console.log('1. Ir a: http://localhost:5174/');
  console.log('2. Login: admin@demo.com / Admin123!');
  console.log('3. Ver los envíos PENDIENTES en el dashboard');
  console.log('4. Click en un envío para ver el nuevo modal con línea de tiempo');
  console.log('5. Probar APROBAR/RECHAZAR envíos pendientes');
  console.log('6. Ver diferentes estados en la línea de tiempo');
  console.log('');
  console.log('🎯 ENVÍOS PARA INTERACTUAR:');
  console.log('- PENDIENTES: Para aprobar/rechazar');
  console.log('- CON DATOS: Para ver línea de tiempo completa');
  console.log('- SIN DATOS: Para probar asignación');
}

createClientShipments();
