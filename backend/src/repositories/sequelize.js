import { Sequelize } from 'sequelize';

export function createSequelize({ host, port, name, user, password }) {
  return new Sequelize(name, user, password, {
    dialect: 'mysql',
    host,
    port,
    logging: false,
    dialectOptions: { connectTimeout: 2000 },
    pool: { acquire: 3000 },
  });
}
