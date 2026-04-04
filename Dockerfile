FROM php:8.2-cli
RUN apt-get update && apt-get install -y zip unzip git libzip-dev && docker-php-ext-install pdo pdo_mysql && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && apt-get clean
WORKDIR /app
COPY . .
RUN composer install --no-dev --optimize-autoloader
EXPOSE 8080
CMD ["php", "server.php"]