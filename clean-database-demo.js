#!/usr/bin/env node

/**
 * Script para limpiar completamente la base de datos y dejar solo las cuentas @demo
 * para pruebas. Esto elimina todos los datos excepto las 3 cuentas principales de demo.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Limpiando base de datos para pruebas con cuentas @demo...\n');

  try {
    // 1. Eliminar todos los datos en orden correcto (por foreign keys)
    console.log('📦 Eliminando datos existentes...');
    
    // Eliminar en orden inverso a como fueron creados
    await prisma.alert.deleteMany();
    await prisma.paymentVerification.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.shipment.deleteMany();
    await prisma.driverAssignment.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driver.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany({ where: { email: { not: { in: ['admin@demo.com', 'cliente@demo.com', 'conductor@demo.com'] } } } });
    await prisma.tenant.deleteMany({ where: { slug: { not: 'demo' } } });

    console.log('✅ Datos eliminados correctamente\n');

    // 2. Verificar/crear tenant demo
    console.log('🏢 Verificando tenant demo...');
    let tenantDemo = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
    
    if (!tenantDemo) {
      tenantDemo = await prisma.tenant.create({
        data: {
          name: 'Empresa Demo',
          slug: 'demo',
          status: 'ACTIVA',
          subscriptionStatus: 'active',
          billingCycle: 'monthly',
        }
      });
      console.log('✅ Tenant demo creado');
    } else {
      console.log('✅ Tenant demo ya existe');
    }

    // 3. Crear/verificar las 3 cuentas @demo
    console.log('\n👤 Creando/verificando cuentas demo...');

    // Admin
    let adminUser = await prisma.user.findUnique({ where: { email: 'admin@demo.com' } });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      adminUser = await prisma.user.create({
        data: {
          email: 'admin@demo.com',
          password: hashedPassword,
          role: 'admin',
          tenantId: tenantDemo.id,
        }
      });
      console.log('✅ Admin@demo.com creado');
    } else {
      console.log('✅ Admin@demo.com ya existe');
    }

    // Cliente
    let clienteUser = await prisma.user.findUnique({ where: { email: 'cliente@demo.com' } });
    if (!clienteUser) {
      const hashedPassword = await bcrypt.hash('Cliente123!', 10);
      clienteUser = await prisma.user.create({
        data: {
          email: 'cliente@demo.com',
          password: hashedPassword,
          role: 'cliente',
          tenantId: tenantDemo.id,
        }
      });
      console.log('✅ Cliente@demo.com creado');
    } else {
      console.log('✅ Cliente@demo.com ya existe');
    }

    // Conductor
    let conductorUser = await prisma.user.findUnique({ where: { email: 'conductor@demo.com' } });
    if (!conductorUser) {
      const hashedPassword = await bcrypt.hash('Conductor123!', 10);
      conductorUser = await prisma.user.create({
        data: {
          email: 'conductor@demo.com',
          password: hashedPassword,
          role: 'conductor',
          tenantId: tenantDemo.id,
        }
      });
      console.log('✅ Conductor@demo.com creado');
    } else {
      console.log('✅ Conductor@demo.com ya existe');
    }

    // 4. Crear customer para el cliente
    console.log('\n🏭 Creando customer para cliente@demo.com...');
    let customerDemo = await prisma.customer.findFirst({ where: { tenantId: tenantDemo.id } });
    if (!customerDemo) {
      customerDemo = await prisma.customer.create({
        data: {
          name: 'Cliente Demo S.A.',
          taxId: '76.123.456-7',
          email: 'cliente@demo.com',
          phone: '+56 9 1234 5678',
          address: 'Av. Demo 123, Santiago, Chile',
          tenantId: tenantDemo.id,
          userId: clienteUser.id,
        }
      });
      console.log('✅ Customer demo creado');
    } else {
      console.log('✅ Customer demo ya existe');
    }

    // 5. Crear conductor para el conductor
    console.log('\n🚛 Creando conductor para conductor@demo.com...');
    let driverDemo = await prisma.driver.findFirst({ where: { tenantId: tenantDemo.id } });
    if (!driverDemo) {
      driverDemo = await prisma.driver.create({
        data: {
          fullName: 'Conductor Demo',
          taxId: '12.345.678-9',
          phone: '+56 9 8765 4321',
          licenseNumber: 'CH123456789',
          licenseExpiry: new Date('2025-12-31'),
          status: 'activo',
          tenantId: tenantDemo.id,
          userId: conductorUser.id,
        }
      });
      console.log('✅ Driver demo creado');
    } else {
      console.log('✅ Driver demo ya existe');
    }

    // 6. Crear vehículo para el conductor
    console.log('\n🚗 Creando vehículo para conductor demo...');
    let vehicleDemo = await prisma.vehicle.findFirst({ where: { tenantId: tenantDemo.id } });
    if (!vehicleDemo) {
      vehicleDemo = await prisma.vehicle.create({
        data: {
          plate: 'DEMO123',
          make: 'Demo Truck',
          model: 'Modelo Demo',
          year: 2024,
          status: 'disponible',
          capacityKg: 5000,
          tenantId: tenantDemo.id,
          driverId: driverDemo.id,
        }
      });
      console.log('✅ Vehicle demo creado');
    } else {
      console.log('✅ Vehicle demo ya existe');
    }

    // 7. Asignar vehículo al conductor
    await prisma.driver.update({
      where: { id: driverDemo.id },
      data: { assignedVehicleId: vehicleDemo.id }
    });

    console.log('\n🎉 Base de datos limpiada y configurada para pruebas!');
    console.log('\n📋 Cuentas disponibles:');
    console.log('🔹 Admin:     admin@demo.com / Admin123!');
    console.log('🔹 Cliente:   cliente@demo.com / Cliente123!');
    console.log('🔹 Conductor: conductor@demo.com / Conductor123!');
    
    console.log('\n🌐 URLs de acceso:');
    console.log('🔹 Frontend:  http://localhost:5173');
    console.log('🔹 API:       http://localhost:4000');
    console.log('🔹 Admin:     http://localhost:5173/admin');
    console.log('🔹 Cliente:   http://localhost:5173/cliente');
    console.log('🔹 Conductor: http://localhost:5173/conductor');

  } catch (error) {
    console.error('❌ Error al limpiar la base de datos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
if (require.main === module) {
  cleanDatabase()
    .then(() => {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución:', error);
      process.exit(1);
    });
}

module.exports = { cleanDatabase };
