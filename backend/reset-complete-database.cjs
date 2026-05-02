#!/usr/bin/env node

/**
 * Script para limpiar COMPLETAMENTE la base de datos y crear un sistema
 * completo con pedidos, usuarios, y todo listo para pruebas
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function resetCompleteDatabase() {
  console.log('🔄 Limpiando completamente la base de datos y creando sistema completo...\n');

  try {
    // 1. Eliminar TODOS los datos en orden correcto
    console.log('🗑️  Eliminando todos los datos existentes...');
    
    await prisma.alert.deleteMany();
    await prisma.paymentVerification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.driverAssignment.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.tenant.deleteMany();

    console.log('✅ Base de datos completamente limpiada\n');

    // 2. Crear Tenant principal
    console.log('🏢 Creando tenant principal...');
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Transporte Demo Pro',
        slug: 'demo',
        subscription: {
          create: {
            status: 'active',
            billingCycle: 'monthly',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          }
        }
      }
    });
    console.log('✅ Tenant creado\n');

    // 3. Crear Company
    console.log('🏭 Creando empresa...');
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        legalName: 'Transporte Demo Pro S.A.',
        taxId: '76.123.456-7',
        address: 'Av. Principal 123, Santiago, Chile',
        phone: '+56 2 2345 6789',
        pricingBaseFee: 5000,
        pricingPerKg: 0.05,
        pricingPerM3: 0.10,
        pricingMinimumCharge: 10000,
        driverCommissionPercent: 40,
      }
    });
    console.log('✅ Empresa creada\n');

    // 4. Crear usuarios principales
    console.log('👤 Creando usuarios principales...');
    
    const hashedAdminPassword = await bcrypt.hash('Admin123!', 10);
    const adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@demo.com',
        passwordHash: hashedAdminPassword,
        role: 'admin',
      }
    });

    const hashedClientePassword = await bcrypt.hash('Cliente123!', 10);
    const clienteUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'cliente@demo.com',
        passwordHash: hashedClientePassword,
        role: 'cliente',
      }
    });

    const hashedConductorPassword = await bcrypt.hash('Conductor123!', 10);
    const conductorUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'conductor@demo.com',
        passwordHash: hashedConductorPassword,
        role: 'conductor',
      }
    });

    console.log('✅ Usuarios principales creados\n');

    // 5. Crear conductores
    console.log('🚛 Creando conductores...');
    const drivers = [];
    
    for (let i = 1; i <= 3; i++) {
      const driver = await prisma.driver.create({
        data: {
          tenantId: tenant.id,
          fullName: `Conductor ${i}`,
          taxId: `12.345.67${i}-9`,
          phone: `+56 9 1234 567${i}`,
          licenseNumber: `CH12345678${i}`,
          licenseExpiry: new Date('2025-12-31'),
          status: 'activo',
        }
      });
      drivers.push(driver);

      // Crear usuario para cada conductor
      const driverEmail = `conductor${i}@demo.com`;
      const driverPassword = await bcrypt.hash('Conductor123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: driverEmail,
          passwordHash: driverPassword,
          role: 'conductor',
          driverId: driver.id,
        }
      });

      // Crear vehículo para cada conductor
      await prisma.vehicle.create({
        data: {
          tenantId: tenant.id,
          plate: `ABC${100 + i}`,
          make: 'Toyota',
          model: 'Hilux',
          year: 2024,
          status: 'disponible',
          capacityKg: 3000,
          driverId: driver.id,
        }
      });
    }
    console.log('✅ Conductores y vehículos creados\n');

    // 6. Crear clientes
    console.log('👥 Creando clientes...');
    const customers = [];
    
    for (let i = 1; i <= 5; i++) {
      const customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: `Cliente ${i}`,
          taxId: `76.555.44${i}-3`,
          email: `cliente${i}@demo.com`,
          phone: `+56 2 5555 444${i}`,
          address: `Dirección Cliente ${i}, Santiago`,
        }
      });
      customers.push(customer);

      // Crear usuario para cada cliente
      const customerEmail = `cliente${i}@demo.com`;
      const customerPassword = await bcrypt.hash('Cliente123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: customerEmail,
          passwordHash: customerPassword,
          role: 'cliente',
          customerId: customer.id,
        }
      });
    }
    console.log('✅ Clientes creados\n');

    // 7. Crear pedidos/envíos de prueba
    console.log('📦 Creando pedidos/envíos de prueba...');
    const shipments = [];
    
    const shipmentData = [
      {
        origin: 'Santiago, Chile',
        destination: 'Valparaíso, Chile',
        cargoType: 'caja',
        weightKg: 100,
        customerName: 'Cliente 1',
        customerPhone: '+56 2 5555 4441',
        status: 'pendiente',
      },
      {
        origin: 'Concepción, Chile',
        destination: 'Temuco, Chile',
        cargoType: 'pallet',
        weightKg: 500,
        customerName: 'Cliente 2',
        customerPhone: '+56 2 5555 4442',
        status: 'confirmado',
      },
      {
        origin: 'Antofagasta, Chile',
        destination: 'La Serena, Chile',
        cargoType: 'granel',
        weightKg: 1000,
        customerName: 'Cliente 3',
        customerPhone: '+56 2 5555 4443',
        status: 'recogido',
      },
      {
        origin: 'Rancagua, Chile',
        destination: 'Curicó, Chile',
        cargoType: 'contenedor',
        weightKg: 2000,
        customerName: 'Cliente 4',
        customerPhone: '+56 2 5555 4444',
        status: 'en_transito',
      },
      {
        origin: 'Talca, Chile',
        destination: 'Chillán, Chile',
        cargoType: 'caja',
        weightKg: 150,
        customerName: 'Cliente 5',
        customerPhone: '+56 2 5555 4445',
        status: 'entregado',
      },
      {
        origin: 'Puerto Montt, Chile',
        destination: 'Osorno, Chile',
        cargoType: 'pallet',
        weightKg: 300,
        customerName: 'Cliente 1',
        customerPhone: '+56 2 5555 4441',
        status: 'rechazado',
      }
    ];

    for (let i = 0; i < shipmentData.length; i++) {
      const data = shipmentData[i];
      const shipment = await prisma.shipment.create({
        data: {
          tenantId: tenant.id,
          customerId: customers[i % customers.length].id,
          driverId: i < drivers.length ? drivers[i].id : null,
          origin: data.origin,
          destination: data.destination,
          cargoType: data.cargoType,
          weightKg: data.weightKg,
          status: data.status,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          scheduledDelivery: new Date(Date.now() + (i + 1) * 86400000),
          price: 5000 + (data.weightKg * 0.05),
          createdAt: new Date(Date.now() - i * 3600000),
        }
      });
      shipments.push(shipment);
    }
    console.log('✅ Pedidos/envíos creados\n');

    // 8. Crear facturas
    console.log('🧾 Creando facturas...');
    for (let i = 0; i < 3; i++) {
      await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          customerId: customers[i].id,
          shipmentId: shipments[i].id,
          number: `FAC-2024-${1000 + i}`,
          amount: shipments[i].price,
          status: 'borrador',
          issuedAt: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }
      });
    }
    console.log('✅ Facturas creadas\n');

    // 9. Crear pagos
    console.log('💰 Creando pagos...');
    for (let i = 0; i < 2; i++) {
      await prisma.payment.create({
        data: {
          tenantId: tenant.id,
          customerId: customers[i].id,
          invoiceId: shipments[i].id,
          amount: shipments[i].price * 0.5,
          status: 'pendiente',
          method: 'transferencia',
          paidAt: null,
        }
      });
    }
    console.log('✅ Pagos creados\n');

    console.log('🎉 Sistema completo creado exitosamente!\n');
    
    console.log('📋 Accesos disponibles:');
    console.log('');
    console.log('🔹 Administrador:');
    console.log('   Email: admin@demo.com');
    console.log('   Password: Admin123!');
    console.log('   URL: http://localhost:5173/admin');
    console.log('');
    console.log('🔹 Clientes:');
    for (let i = 1; i <= 5; i++) {
      console.log(`   Cliente ${i}: cliente${i}@demo.com / Cliente123!`);
    }
    console.log('   URL: http://localhost:5173/cliente');
    console.log('');
    console.log('🔹 Conductores:');
    for (let i = 1; i <= 3; i++) {
      console.log(`   Conductor ${i}: conductor${i}@demo.com / Conductor123!`);
    }
    console.log('   URL: http://localhost:5173/conductor');
    console.log('');
    
    console.log('📊 Datos creados:');
    console.log(`   🏢 Tenant: 1`);
    console.log(`   🏭 Empresa: 1`);
    console.log(`   👥 Clientes: 5`);
    console.log(`   🚛 Conductores: 3`);
    console.log(`   🚗 Vehículos: 3`);
    console.log(`   📦 Envíos: 6 (con diferentes estados)`);
    console.log(`   🧾 Facturas: 3`);
    console.log(`   💰 Pagos: 2`);
    console.log('');
    
    console.log('🌐 Para probar el sistema completo:');
    console.log('1. Inicia sesión como admin@demo.com');
    console.log('2. Verás todos los envíos, clientes y conductores');
    console.log('3. Prueba crear nuevos envíos');
    console.log('4. Prueba asignar conductores');
    console.log('5. Inicia sesión como cliente para ver sus envíos');
    console.log('6. Inicia sesión como conductor para ver sus rutas');

  } catch (error) {
    console.error('❌ Error al resetear la base de datos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
if (require.main === module) {
  resetCompleteDatabase()
    .then(() => {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución:', error);
      process.exit(1);
    });
}

module.exports = { resetCompleteDatabase };
