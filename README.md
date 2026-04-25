> [!WARNING]
> This project is very much still a work in progress and not ready for public
> consumption yet. But feel free to have a play around if you're feeling
> adventurous. Just be aware there's no documentation yet.


## Development Notes
### Running Migrations
Migrations will automatically be run when starting the server however they can also be run explicitly with
```shell
drizzle-kit migrate
```
### Creating a Migration
```shell
# Add "--custom" for creating an empty migration to manually edit
drizzle-kit generate --name short_description_of_change
```
