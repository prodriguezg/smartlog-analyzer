import { Sequelize } from 'sequelize';
import { defineModels } from './models/index.js';

export function createSequelize({ host, port, name, user, password }) {
  const database = new Sequelize(name, user, password, {
    dialect: 'mysql',
    host,
    port,
    logging: false,
    dialectOptions: { connectTimeout: 2000 },
    pool: { acquire: 3000 },
  });
  defineModels(database);
  return database;
}
