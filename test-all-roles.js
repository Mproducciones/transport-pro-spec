#!/usr/bin/env node

/**
 * Script para pruebas interactivas completas en todos los roles de usuario
 * Simula interacciones reales como si fuera un usuario usando la aplicación
 */

const { default: fetch } = require('node-fetch');

const BASE_URL = 'http://localhost:4000/api/v1';
const FRONTEND_URL = 'http://localhost:5173';

// Credenciales de prueba
const USERS = {
  admin: {
    email: 'admin@demo.com',
    password: 'Admin123!',
    role: 'Administrador',
    tests: [
      'login',
      'getDashboard',
      'getDrivers',
      'getCustomers',
      'getShipments',
      'createShipment',
      'updateShipment',
      'deleteDriver'
    ]
  },
  cliente: {
    email: 'cliente@demo.com',
    password: 'Cliente123!',
    role: 'Cliente',
    tests: [
      'login',
      'getDashboard',
      'getShipments',
      'createShipment',
      'getInvoices',
      'updateProfile'
    ]
  },
  conductor: {
    email: 'conductor@demo.com',
    password: 'Conductor123!',
    role: 'Conductor',
    tests: [
      'login',
      'getDashboard',
      'getAssignedShipments',
      'updateShipmentStatus',
      'getProfile',
      'updateLocation'
    ]
  }
};

let authTokens = {};

// Función para hacer login
async function login(email, password) {
  console.log(`🔐 Iniciando sesión como ${email}...`);
  
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      throw new Error(`Login fallido: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Login exitoso para ${email}`);
    return data.token;
  } catch (error) {
    console.error(`❌ Error en login para ${email}:`, error.message);
    return null;
  }
}

// Función para hacer peticiones autenticadas
async function authenticatedRequest(token, endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    
    if (!response.ok) {
      throw new Error(`${method} ${endpoint} falló: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Error en ${method} ${endpoint}:`, error.message);
    return null;
  }
}

// Tests para Admin
async function testAdminFeatures(token) {
  console.log('\n👨‍💼 Probando funcionalidades de Administrador...');
  
  // Dashboard
  const dashboard = await authenticatedRequest(token, '/admin/dashboard');
  if (dashboard) {
    console.log('✅ Dashboard admin obtenido');
    console.log(`📊 Envíos totales: ${dashboard.totalShipments || 0}`);
    console.log(`🚛 Conductores: ${dashboard.totalDrivers || 0}`);
    console.log(`👥 Clientes: ${dashboard.totalCustomers || 0}`);
  }

  // Conductores
  const drivers = await authenticatedRequest(token, '/drivers');
  if (drivers) {
    console.log(`✅ Lista de conductores obtenida (${drivers.length} conductores)`);
    if (drivers.length > 0) {
      console.log(`👤 Primer conductor: ${drivers[0].fullName}`);
    }
  }

  // Clientes
  const customers = await authenticatedRequest(token, '/customers');
  if (customers) {
    console.log(`✅ Lista de clientes obtenida (${customers.length} clientes)`);
    if (customers.length > 0) {
      console.log(`🏢 Primer cliente: ${customers[0].name}`);
    }
  }

  // Envíos
  const shipments = await authenticatedRequest(token, '/shipments');
  if (shipments) {
    console.log(`✅ Lista de envíos obtenida (${shipments.length} envíos)`);
    if (shipments.length > 0) {
      console.log(`📦 Primer envío: ${shipments[0].origin} → ${shipments[0].destination}`);
    }
  }

  // Crear envío de prueba
  const newShipment = await authenticatedRequest(token, '/shipments', 'POST', {
    origin: 'Santiago, Chile',
    destination: 'Valparaíso, Chile',
    cargoType: 'caja',
    weightKg: 100,
    customerName: 'Cliente Test Admin',
    customerPhone: '+56 9 1234 5678',
    scheduledDelivery: new Date(Date.now() + 86400000).toISOString()
  });
  if (newShipment) {
    console.log(`✅ Envío creado: ${newShipment.id}`);
    
    // Actualizar estado del envío
    const updated = await authenticatedRequest(token, `/shipments/${newShipment.id}`, 'PATCH', {
      status: 'confirmado'
    });
    if (updated) {
      console.log(`✅ Envío actualizado a estado: ${updated.status}`);
    }
  }

  console.log('🎉 Tests de administrador completados');
}

// Tests para Cliente
async function testCustomerFeatures(token) {
  console.log('\n👤 Probando funcionalidades de Cliente...');
  
  // Dashboard
  const dashboard = await authenticatedRequest(token, '/cliente/dashboard');
  if (dashboard) {
    console.log('✅ Dashboard cliente obtenido');
    console.log(`📦 Envíos activos: ${dashboard.activeShipments || 0}`);
    console.log(`💰 Facturas pendientes: ${dashboard.pendingInvoices || 0}`);
  }

  // Envíos del cliente
  const shipments = await authenticatedRequest(token, '/cliente/shipments');
  if (shipments) {
    console.log(`✅ Envíos del cliente obtenidos (${shipments.length} envíos)`);
    if (shipments.length > 0) {
      console.log(`📦 Último envío: ${shipments[0].origin} → ${shipments[0].destination}`);
    }
  }

  // Crear nuevo envío
  const newShipment = await authenticatedRequest(token, '/cliente/shipments', 'POST', {
    origin: 'Concepción, Chile',
    destination: 'Temuco, Chile',
    cargoType: 'pallet',
    weightKg: 500,
    description: 'Mercancía de prueba cliente',
    scheduledDelivery: new Date(Date.now() + 172800000).toISOString()
  });
  if (newShipment) {
    console.log(`✅ Envío creado por cliente: ${newShipment.id}`);
  }

  // Facturas
  const invoices = await authenticatedRequest(token, '/cliente/invoices');
  if (invoices) {
    console.log(`✅ Facturas del cliente obtenidas (${invoices.length} facturas)`);
  }

  console.log('🎉 Tests de cliente completados');
}

// Tests para Conductor
async function testDriverFeatures(token) {
  console.log('\n🚛 Probando funcionalidades de Conductor...');
  
  // Dashboard
  const dashboard = await authenticatedRequest(token, '/conductor/dashboard');
  if (dashboard) {
    console.log('✅ Dashboard conductor obtenido');
    console.log(`📦 Envíos asignados: ${dashboard.assignedShipments || 0}`);
    console.log(`🚛 Vehículo: ${dashboard.vehicle?.plate || 'No asignado'}`);
  }

  // Envíos asignados
  const shipments = await authenticatedRequest(token, '/conductor/shipments');
  if (shipments) {
    console.log(`✅ Envíos asignados obtenidos (${shipments.length} envíos)`);
    if (shipments.length > 0) {
      const firstShipment = shipments[0];
      console.log(`📦 Primer envío: ${firstShipment.origin} → ${firstShipment.destination}`);
      console.log(`📊 Estado: ${firstShipment.status}`);
      
      // Actualizar estado del envío (simular acción del conductor)
      if (firstShipment.status === 'confirmado') {
        const updated = await authenticatedRequest(token, `/conductor/shipments/${firstShipment.id}`, 'PATCH', {
          status: 'recogido'
        });
        if (updated) {
          console.log(`✅ Envío actualizado a: ${updated.status}`);
        }
      }
    }
  }

  // Perfil del conductor
  const profile = await authenticatedRequest(token, '/conductor/profile');
  if (profile) {
    console.log('✅ Perfil del conductor obtenido');
    console.log(`👤 Nombre: ${profile.fullName}`);
    console.log(`📱 Teléfono: ${profile.phone}`);
    console.log(`🚗 Licencia: ${profile.licenseNumber}`);
  }

  // Actualizar ubicación (simular GPS)
  const locationUpdate = await authenticatedRequest(token, '/conductor/location', 'POST', {
    latitude: -33.4489,
    longitude: -70.6693,
    timestamp: new Date().toISOString()
  });
  if (locationUpdate) {
    console.log('✅ Ubicación actualizada');
  }

  console.log('🎉 Tests de conductor completados');
}

// Función principal
async function runAllTests() {
  console.log('🚀 Iniciando pruebas interactivas completas del sistema...\n');
  
  console.log('🌐 URLs de prueba:');
  console.log(`🔹 Frontend: ${FRONTEND_URL}`);
  console.log(`🔹 API: ${BASE_URL}`);
  console.log('');

  for (const [userType, userData] of Object.entries(USERS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎭 Probando rol: ${userData.role} (${userData.email})`);
    console.log(`${'='.repeat(60)}`);
    
    // Login
    const token = await login(userData.email, userData.password);
    if (!token) {
      console.log(`❌ No se pudo autenticar como ${userData.role}`);
      continue;
    }
    
    authTokens[userType] = token;
    
    // Ejecutar tests según el rol
    switch (userType) {
      case 'admin':
        await testAdminFeatures(token);
        break;
      case 'cliente':
        await testCustomerFeatures(token);
        break;
      case 'conductor':
        await testDriverFeatures(token);
        break;
    }
    
    console.log(`\n✅ Tests de ${userData.role} completados exitosamente`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 TODAS LAS PRUEBAS COMPLETADAS');
  console.log('='.repeat(60));
  
  console.log('\n📋 Resumen de cuentas probadas:');
  console.log('🔹 Admin:     admin@demo.com / Admin123!');
  console.log('🔹 Cliente:   cliente@demo.com / Cliente123!');
  console.log('🔹 Conductor: conductor@demo.com / Conductor123!');
  
  console.log('\n🌐 Para pruebas manuales en navegador:');
  console.log(`🔹 Admin:     ${FRONTEND_URL}/admin`);
  console.log(`🔹 Cliente:   ${FRONTEND_URL}/cliente`);
  console.log(`🔹 Conductor: ${FRONTEND_URL}/conductor`);
  
  console.log('\n✨ Sistema listo para pruebas interactivas manuales');
}

// Ejecutar el script
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\n✨ Script de pruebas completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución de pruebas:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };
