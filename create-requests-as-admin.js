// Crear solicitudes variadas usando admin para simular clientes
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

async function createRequestsAsAdmin() {
  console.log('🔧 CREANDO SOLICITUDES VARIADAS USANDO ADMIN (simulando clientes)\n');

  // 1. Login como administrador
  let token = null;
  let clients = [];
  let drivers = [];
  let vehicles = [];

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

  // 2. Obtener datos necesarios
  try {
    const clientsResponse = await makeRequest('/api/v1/customers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    const driversResponse = await makeRequest('/api/v1/drivers', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    const vehiclesResponse = await makeRequest('/api/v1/vehicles', 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (clientsResponse.statusCode === 200) {
      clients = JSON.parse(clientsResponse.body).data || [];
    }
    
    if (driversResponse.statusCode === 200) {
      drivers = JSON.parse(driversResponse.body).data || [];
    }
    
    if (vehiclesResponse.statusCode === 200) {
      vehicles = JSON.parse(vehiclesResponse.body).data || [];
    }
    
    console.log(`✅ Datos obtenidos: ${clients.length} clientes, ${drivers.length} conductores, ${vehicles.length} vehículos`);
  } catch (error) {
    console.log('❌ Error obteniendo datos:', error.message);
    return;
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0);

  console.log('\n📦 3. CREANDO ENVÍOS PENDIENTES (para aprobar)');
  
  const pendingRequests = [
    {
      description: 'Envío urgente de documentos - Hoy mismo',
      origin: 'Santiago, Centro',
      destination: 'Providencia, Las Condes',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 15,
      cargoVolumeM3: 0.5,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() + 1 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      amount: 35000,
      status: 'pendiente'
    },
    {
      description: 'Entrega de equipo médico - Urgente',
      origin: 'Viña del Mar, Centro',
      destination: 'Valparaíso, Puerto',
      cargoType: 'caja',
      cargoQuantity: 1,
      cargoWeightKg: 25,
      cargoVolumeM3: 0.3,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      amount: 42000,
      status: 'pendiente'
    },
    {
      description: 'Materiales de construcción - Mañana',
      origin: 'San Bernardo, Centro',
      destination: 'Puente Alto, La Florida',
      cargoType: 'pallet',
      cargoQuantity: 4,
      cargoWeightKg: 320,
      cargoVolumeM3: 2.1,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      amount: 88000,
      status: 'pendiente'
    }
  ];

  let createdPending = 0;
  for (let i = 0; i < Math.min(pendingRequests.length, clients.length); i++) {
    const client = clients[i];
    const request = pendingRequests[i];
    
    const shipmentData = {
      ...request,
      customerId: client.id,
      customer: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email || ''
      },
      // Sin conductor ni vehículo inicialmente
      driverId: null,
      driver: null,
      vehicleId: null,
      vehicle: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
        'Authorization': `Bearer ${token}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdPending++;
        console.log(`✅ Envío pendiente creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log(`   Estado: PENDIENTE (para aprobar)`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío pendiente: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío pendiente:`, error.message);
    }
  }

  console.log(`📊 Envíos pendientes creados: ${createdPending}\n`);

  console.log('🚛 4. CREANDO ENVÍOS CONFIRMADOS (con conductor y vehículo)');
  
  const confirmedRequests = [
    {
      description: 'Electrónicos en ruta',
      origin: 'Santiago, Providencia',
      destination: 'Viña del Mar, Centro',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 85,
      cargoVolumeM3: 1.1,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() + 1 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 5 * 60 * 60 * 1000).toISOString(),
      amount: 75000,
      status: 'confirmado'
    },
    {
      description: 'Ropa y accesorios',
      origin: 'Concepción, Centro',
      destination: 'Chillán, Centro',
      cargoType: 'caja',
      cargoQuantity: 5,
      cargoWeightKg: 45,
      cargoVolumeM3: 0.9,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 7 * 60 * 60 * 1000).toISOString(),
      amount: 52000,
      status: 'confirmado'
    }
  ];

  let createdConfirmed = 0;
  for (let i = 0; i < Math.min(confirmedRequests.length, clients.length - createdPending); i++) {
    const client = clients[i + createdPending];
    const request = confirmedRequests[i];
    const driver = drivers[i % drivers.length];
    const vehicle = vehicles[i % vehicles.length];
    
    const shipmentData = {
      ...request,
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
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
        'Authorization': `Bearer ${token}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdConfirmed++;
        console.log(`✅ Envío confirmado creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Conductor: ${driver.fullName}`);
        console.log(`   Vehículo: ${vehicle.plate}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log(`   Estado: CONFIRMADO`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío confirmado: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío confirmado:`, error.message);
    }
  }

  console.log(`📊 Envíos confirmados creados: ${createdConfirmed}\n`);

  console.log('⚡ 5. CREANDO ENVÍOS EN TRÁNSITO');
  
  const inTransitRequests = [
    {
      description: 'Productos alimenticios en camino',
      origin: 'Valparaíso, Puerto',
      destination: 'Santiago, Centro',
      cargoType: 'caja',
      cargoQuantity: 6,
      cargoWeightKg: 120,
      cargoVolumeM3: 1.5,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      pickedUpAt: new Date(todayStart.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      amount: 65000,
      status: 'en_transito'
    },
    {
      description: 'Muebles en entrega',
      origin: 'La Serena, Centro',
      destination: 'Coquimbo, Puerto',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 180,
      cargoVolumeM3: 2.8,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() + 1 * 60 * 60 * 1000).toISOString(),
      pickedUpAt: new Date(todayStart.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      amount: 92000,
      status: 'en_transito'
    }
  ];

  let createdInTransit = 0;
  for (let i = 0; i < Math.min(inTransitRequests.length, clients.length - createdPending - createdConfirmed); i++) {
    const client = clients[i + createdPending + createdConfirmed];
    const request = inTransitRequests[i];
    const driver = drivers[(i + 1) % drivers.length];
    const vehicle = vehicles[(i + 1) % vehicles.length];
    
    const shipmentData = {
      ...request,
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
      },
      createdAt: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
        'Authorization': `Bearer ${token}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdInTransit++;
        console.log(`✅ Envío en tránsito creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Conductor: ${driver.fullName}`);
        console.log(`   Vehículo: ${vehicle.plate}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log(`   Estado: EN TRÁNSITO`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío en tránsito: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío en tránsito:`, error.message);
    }
  }

  console.log(`📊 Envíos en tránsito creados: ${createdInTransit}\n`);

  console.log('✅ 6. CREANDO ENVÍOS ENTREGADOS');
  
  const deliveredRequests = [
    {
      description: 'Documentos legales entregados',
      origin: 'Rancagua, Centro',
      destination: 'Talca, Centro',
      cargoType: 'caja',
      cargoQuantity: 2,
      cargoWeightKg: 15,
      cargoVolumeM3: 0.4,
      requiresHelper: false,
      scheduledPickup: new Date(todayStart.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      pickedUpAt: new Date(todayStart.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      deliveredAt: new Date(todayStart.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      deliveredToName: 'Juan Pérez',
      amount: 38000,
      status: 'entregado'
    },
    {
      description: 'Equipamiento médico entregado',
      origin: 'Temuco, Centro',
      destination: 'Puerto Montt, Centro',
      cargoType: 'caja',
      cargoQuantity: 3,
      cargoWeightKg: 95,
      cargoVolumeM3: 1.2,
      requiresHelper: true,
      scheduledPickup: new Date(todayStart.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      scheduledDelivery: new Date(todayStart.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      pickedUpAt: new Date(todayStart.getTime() - 8 * 60 * 60 * 1000).toISOString(),
      deliveredAt: new Date(todayStart.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      deliveredToName: 'María González',
      amount: 115000,
      status: 'entregado'
    }
  ];

  let createdDelivered = 0;
  for (let i = 0; i < Math.min(deliveredRequests.length, clients.length - createdPending - createdConfirmed - createdInTransit); i++) {
    const client = clients[i + createdPending + createdConfirmed + createdInTransit];
    const request = deliveredRequests[i];
    const driver = drivers[(i + 2) % drivers.length];
    const vehicle = vehicles[(i + 2) % vehicles.length];
    
    const shipmentData = {
      ...request,
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
      },
      createdAt: new Date(today.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const response = await makeRequest('/api/v1/shipments', 'POST', shipmentData, {
        'Authorization': `Bearer ${token}`
      });

      if (response.statusCode === 201) {
        const data = JSON.parse(response.body);
        createdDelivered++;
        console.log(`✅ Envío entregado creado: ${data.data.id?.substring(-6).toUpperCase()}`);
        console.log(`   Cliente: ${client.name}`);
        console.log(`   Ruta: ${request.origin} → ${request.destination}`);
        console.log(`   Conductor: ${driver.fullName}`);
        console.log(`   Vehículo: ${vehicle.plate}`);
        console.log(`   Monto: $${request.amount.toLocaleString('es-CL')}`);
        console.log(`   Estado: ENTREGADO`);
        console.log(`   Recibido por: ${request.deliveredToName}`);
        console.log('');
      } else {
        console.log(`❌ Error creando envío entregado: ${response.statusCode}`);
      }
    } catch (error) {
      console.log(`❌ Error creando envío entregado:`, error.message);
    }
  }

  console.log(`📊 Envíos entregados creados: ${createdDelivered}\n`);

  // Resumen final
  const totalCreated = createdPending + createdConfirmed + createdInTransit + createdDelivered;
  console.log('📊 RESUMEN FINAL DE ENVÍOS CREADOS:');
  console.log(`✅ Envíos PENDIENTES (para aprobar): ${createdPending}`);
  console.log(`✅ Envíos CONFIRMADOS (con conductor): ${createdConfirmed}`);
  console.log(`✅ Envíos EN TRÁNSITO (activos): ${createdInTransit}`);
  console.log(`✅ Envíos ENTREGADOS (completados): ${createdDelivered}`);
  console.log(`📈 Total nuevos envíos: ${totalCreated}`);
  
  console.log('\n🎯 AHORA PUEDES PROBAR COMPLETAMENTE EL SISTEMA:');
  console.log('1. Ir a: http://localhost:5174/');
  console.log('2. Login: admin@demo.com / Admin123!');
  console.log('3. Ver envíos PENDIENTES para aprobar/rechazar');
  console.log('4. Ver envíos CONFIRMADOS con línea de tiempo');
  console.log('5. Ver envíos EN TRÁNSITO con animación activa');
  console.log('6. Ver envíos ENTREGADOS con proceso completo');
  console.log('7. Probar el modal rediseñado en todos los estados');
  
  console.log('\n🚚 PRÓXIMO PASO: Pruebas del panel de conductor');
}

createRequestsAsAdmin();
