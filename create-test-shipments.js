// Crear solicitudes de envío de prueba para interacciones de administrador
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

async function createTestShipments() {
  console.log('🚚 Creando solicitudes de envío de prueba...\n');

  // Login como admin
  let token = null;
  try {
    const response = await makeRequest('/api/v1/auth/login', 'POST', {
      email: 'admin@demo.com',
      password: 'Admin123!'
    });
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      token = data.data?.token;
      console.log('✅ Login admin exitoso');
    }
  } catch (error) {
    console.log('❌ Error login:', error.message);
    return;
  }

  if (!token) {
    console.log('❌ No se obtuvo token');
    return;
  }

  // Obtener clientes y conductores existentes
  console.log('\n📋 Obteniendo datos existentes...');
  
  let clients = [];
  let drivers = [];
  let vehicles = [];

  try {
    // Obtener clientes
    const clientsResponse = await makeRequest('/api/v1/customers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (clientsResponse.statusCode === 200) {
      const clientsData = JSON.parse(clientsResponse.body);
      clients = clientsData.data || [];
      console.log(`👥 Clientes encontrados: ${clients.length}`);
    }

    // Obtener conductores
    const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (driversResponse.statusCode === 200) {
      const driversData = JSON.parse(driversResponse.body);
      drivers = driversData.data || [];
      console.log(`🚛 Conductores encontrados: ${drivers.length}`);
    }

    // Obtener vehículos
    const vehiclesResponse = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (vehiclesResponse.statusCode === 200) {
      const vehiclesData = JSON.parse(vehiclesResponse.body);
      vehicles = vehiclesData.data || [];
      console.log(`🚗 Vehículos encontrados: ${vehicles.length}`);
    }
  } catch (error) {
    console.log('❌ Error obteniendo datos:', error.message);
  }

  if (clients.length === 0 || drivers.length === 0) {
    console.log('❌ No hay suficientes clientes o conductores para crear envíos');
    return;
  }

  // Crear envíos de prueba con diferentes estados
  console.log('\n📦 Creando envíos de prueba...\n');

  const testShipments = [
    {
      status: 'pendiente',
      origin: 'Santiago, Providencia',
      destination: 'Viña del Mar, Centro',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 280,
      cargoVolumeM3: 1.8,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2 horas
      scheduledDelivery: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // +8 horas
      amount: 75000,
      totalAmount: 75000,
      paymentStatus: 'pendiente',
      description: 'Envío de documentos importantes'
    },
    {
      status: 'confirmado',
      origin: 'Concepción, Centro',
      destination: 'Chillán, Centro',
      cargoType: 'paquete',
      cargoQuantity: 5,
      cargoWeightKg: 150,
      cargoVolumeM3: 2.5,
      requiresHelper: true,
      scheduledPickup: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      amount: 120000,
      totalAmount: 120000,
      paymentStatus: 'parcial',
      description: 'Envío de mercancía comercial'
    },
    {
      status: 'recogido',
      origin: 'Valparaíso, Puerto',
      destination: 'Santiago, Las Condes',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 450,
      cargoVolumeM3: 3.2,
      requiresHelper: true,
      scheduledPickup: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // -1 hora
      scheduledDelivery: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // +3 horas
      pickedUpAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // -30 minutos
      amount: 95000,
      totalAmount: 95000,
      paymentStatus: 'pagado',
      description: 'Envío de equipamiento electrónico'
    },
    {
      status: 'en_transito',
      origin: 'La Serena, Centro',
      destination: 'Coquimbo, Puerto',
      cargoType: 'saco',
      cargoQuantity: 8,
      cargoWeightKg: 320,
      cargoVolumeM3: 4.1,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // -3 horas
      scheduledDelivery: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // +1 hora
      pickedUpAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // -2 horas
      amount: 85000,
      totalAmount: 85000,
      paymentStatus: 'pagado',
      description: 'Envío de productos agrícolas'
    },
    {
      status: 'entregado',
      origin: 'Rancagua, Centro',
      destination: 'San Fernando, Centro',
      cargoType: 'caja',
      cargoQuantity: 4,
      cargoWeightKg: 200,
      cargoVolumeM3: 2.8,
      requiresHelper: false,
      scheduledPickup: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // -6 horas
      scheduledDelivery: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // -2 horas
      pickedUpAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // -5 horas
      deliveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // -2 horas
      deliveredToName: 'Juan Pérez',
      amount: 65000,
      totalAmount: 65000,
      paymentStatus: 'pagado',
      description: 'Envío de documentos legales'
    }
  ];

  const createdShipments = [];

  for (let i = 0; i < testShipments.length; i++) {
    const shipment = testShipments[i];
    const client = clients[i % clients.length];
    const driver = drivers[i % drivers.length];
    const vehicle = vehicles[i % vehicles.length];

    const shipmentData = {
      ...shipment,
      customerId: client.id,
      customer: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email || ''
      },
      driverId: driver.id,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone
      },
      vehicleId: vehicle.id,
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        kind: vehicle.kind
      }
    };

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
        'Authorization': `Bearer ${token}`
      });

      if (response.statusCode === 201) {
        const createdData = JSON.parse(response.body);
        createdShipments.push(createdData.data);
        console.log(`✅ Envío ${i + 1} creado: ${shipment.status.toUpperCase()}`);
        console.log(`   ${shipment.origin} → ${shipment.destination}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Conductor: ${driver.fullName}`);
        console.log(`   Vehículo: ${vehicle.plate}`);
        console.log(`   Monto: $${shipment.amount.toLocaleString('es-CL')}`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío ${i + 1}: ${response.statusCode}`);
        console.log(`   ${response.body}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío ${i + 1}:`, error.message);
    }
  }

  // Resumen
  console.log('📊 RESUMEN DE ENVÍOS CREADOS:');
  console.log(`✅ Total creados: ${createdShipments.length}`);
  console.log('');
  
  createdShipments.forEach((shipment, index) => {
    console.log(`${index + 1}. ${shipment.id?.substring(-6).toUpperCase()}`);
    console.log(`   Estado: ${shipment.status}`);
    console.log(`   Ruta: ${shipment.origin} → ${shipment.destination}`);
    console.log(`   Cliente: ${shipment.customer?.name}`);
    console.log(`   Monto: $${shipment.amount?.toLocaleString('es-CL')}`);
    console.log('');
  });

  console.log('🌐 PARA PROBAR EN EL FRONTEND:');
  console.log('1. Ir a: http://localhost:5174/');
  console.log('2. Login: admin@demo.com / Admin123!');
  console.log('3. Ver los envíos en el dashboard');
  console.log('4. Click en cualquier envío para ver el nuevo modal');
  console.log('5. Probar aprobación/rechazo en envíos pendientes');
  console.log('6. Ver la línea de tiempo en diferentes estados');
}

createTestShipments();
