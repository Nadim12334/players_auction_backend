/*
  Warnings:

  - You are about to drop the column `budget` on the `team` table. All the data in the column will be lost.
  - Added the required column `category` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fromWhere` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purse` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Team_name_key` ON `team`;

-- AlterTable
ALTER TABLE `player` ADD COLUMN `category` VARCHAR(191) NOT NULL,
    ADD COLUMN `currentBid` INTEGER NULL,
    ADD COLUMN `fromWhere` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `team` DROP COLUMN `budget`,
    ADD COLUMN `purse` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `Bid` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `playerId` INTEGER NOT NULL,
    `teamId` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
