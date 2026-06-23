FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
# keep the web root clean: drop build/config files that aren't part of the site
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/.dockerignore \
          /usr/share/nginx/html/.gitignore \
          /usr/share/nginx/html/README-DEPLOY.md
EXPOSE 80
